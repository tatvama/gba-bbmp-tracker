/**
 * Next.js server-boot hook (stable since Next 15, runs once when the Node
 * process starts under `next start`/Docker — NOT during `next build`, and
 * NOT in the edge runtime). This is the fix for the escalation ladder's
 * biggest gap: every other mutation in this codebase is request-triggered
 * (a server action's after(), or a cron *route* that nothing external pings)
 * — if no one opens the app, a 14-day/7-working-day clock would never fire.
 *
 * register() starts an in-process interval that calls sweepEscalationCycles()
 * directly (no HTTP round-trip), globalThis-cached like
 * lib/import-queue/worker.ts's kickImportWorker so dev HMR / route-module
 * duplication can't start two of them.
 */

const G_KEY = "__gbaEscalationSweeper__";
const SWEEP_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes — cheap indexed query, small row count

function alreadyStarted(): boolean {
  const g = globalThis as Record<string, unknown>;
  if (g[G_KEY]) return true;
  g[G_KEY] = true;
  return false;
}

async function runSweep(): Promise<void> {
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

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return; // never on the edge runtime
  if (alreadyStarted()) return;

  void runSweep(); // catch anything that elapsed while the process was down
  setInterval(() => void runSweep(), SWEEP_INTERVAL_MS);
}
