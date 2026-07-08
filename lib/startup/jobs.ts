import "server-only";
import type { StartupTask } from "./types";
import { StartupLogger } from "./logger";

const ESCALATION_KEY = "__gbaEscalationSweeper__";
const JOBS_KEY = "__gbaJobSweeper__";
const ESCALATION_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes
const JOBS_SWEEP_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

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

export class BackgroundJobsTask implements StartupTask {
  name = "Background Workers & Schedulers";
  critical = true;

  async run(): Promise<void> {
    if (!alreadyStarted(ESCALATION_KEY)) {
      StartupLogger.info("Starting Escalation Ladder Sweeper interval (20m)...");
      void runEscalationSweep(); // Catch anything that elapsed while process was down
      setInterval(() => void runEscalationSweep(), ESCALATION_INTERVAL_MS);
    } else {
      StartupLogger.info("Escalation Ladder Sweeper already running.");
    }

    if (!alreadyStarted(JOBS_KEY)) {
      StartupLogger.info("Starting Background Job Sweeper interval (2m)...");
      void runJobSweep();
      setInterval(() => void runJobSweep(), JOBS_SWEEP_INTERVAL_MS);
    } else {
      StartupLogger.info("Background Job Sweeper already running.");
    }
  }
}
