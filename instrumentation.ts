/**
 * Next.js server-boot hook (stable since Next 15, runs once when the Node
 * process starts under `next start`/Docker — NOT during `next build`, and
 * NOT in the edge runtime). Two independent in-process sweepers live here:
 *
 * 1. The escalation ladder sweep (unchanged) — the fix for "every other
 *    mutation in this codebase is request-triggered; if no one opens the app,
 *    a 14-day/7-working-day clock would never fire."
 * 2. The background-job framework's dead-job-recovery + due-retry sweep
 *    (lib/jobs/runner.ts's sweepBackgroundJobs) — reclaims a job stuck
 *    'running' because the process that owned it died mid-run, and dispatches
 *    'retrying' jobs whose exponential-backoff window has elapsed.
 *
 * Both are globalThis-cached like lib/import-queue/worker.ts's
 * kickImportWorker so dev HMR / route-module duplication can't start two.
 *
 * DELIBERATELY DOES NOT import lib/jobs/handlers here. Tried it (both as a
 * static top-level import and as a dynamic `await import()` inside
 * register()) — Next.js bundles instrumentation.ts under more restrictive
 * resolution rules than a normal route, and traces through dynamic imports
 * too: the ai_draft handler transitively reaches lib/ai/advisor/context-hash.ts's
 * `import { createHash } from "crypto"`, which fails to resolve in THIS
 * bundle even though the exact same module resolves fine everywhere else.
 * Registration instead happens the same way it always has to for a
 * request-triggered path: every action/route file that calls startJob() for
 * a given type already imports that type's handler for its own side-effect
 * (lib/actions/jobs.ts → ai-draft, the OCR routes → ocr, etc.) — so each
 * handler is registered the first time ANY request touches a route that
 * needs it, typically within seconds of the app being reachable at all. The
 * only gap is a job stuck 'retrying' whose type has genuinely never been
 * touched since the last restart AND the 2-minute sweep fires before any
 * request does — self-healing on the next sweep tick once any request lands,
 * not a correctness bug.
 */

const ESCALATION_KEY = "__gbaEscalationSweeper__";
const JOBS_KEY = "__gbaJobSweeper__";
const ESCALATION_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes — cheap indexed query, small row count
const JOBS_SWEEP_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes — users are watching live progress in the Task Center

function alreadyStarted(key: string): boolean {
  const g = globalThis as Record<string, unknown>;
  if (g[key]) return true;
  g[key] = true;
  return false;
}

async function runEscalationSweep(): Promise<void> {
  try {
    const { sweepEscalationCycles } = await import("@/lib/complaints/escalation-scheduler");
    const result = await sweepEscalationCycles();
    if (result.processed || result.errors.length) {
      console.log(
        `[escalation-sweeper] processed=${result.processed} skipped=${result.skipped} errors=${result.errors.length}`,
      );
      for (const err of result.errors) console.error("[escalation-sweeper]", err);
    }
  } catch (e) {
    console.error("[escalation-sweeper] sweep crashed", e);
  }
}

async function runJobSweep(): Promise<void> {
  try {
    const { sweepBackgroundJobs } = await import("@/lib/jobs/runner");
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const result = await sweepBackgroundJobs(admin);
    if (result.reclaimed || result.retried) {
      console.log(`[job-sweeper] reclaimed=${result.reclaimed} retried=${result.retried}`);
    }
  } catch (e) {
    console.error("[job-sweeper] sweep crashed", e);
  }
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return; // never on the edge runtime

  if (!alreadyStarted(ESCALATION_KEY)) {
    void runEscalationSweep(); // catch anything that elapsed while the process was down
    setInterval(() => void runEscalationSweep(), ESCALATION_INTERVAL_MS);
  }

  if (!alreadyStarted(JOBS_KEY)) {
    void runJobSweep();
    setInterval(() => void runJobSweep(), JOBS_SWEEP_INTERVAL_MS);
  }
}
