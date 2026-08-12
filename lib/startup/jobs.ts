import "server-only";
import type { StartupTask } from "./types";
import { StartupLogger } from "./logger";

const ESCALATION_KEY = "__gbaEscalationSweeper__";
const JOBS_KEY = "__gbaJobSweeper__";
const OVERDUE_ALERT_KEY = "__gbaOverdueAlertSweeper__";
const ESCALATION_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes
const JOBS_SWEEP_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
// Coarser than the other two on purpose: the per-complaint per-day dedupe in
// sweepOverdueAlerts() means anything more frequent than this only costs extra
// DB polling for no earlier-alert benefit, since a complaint already alerted
// today is skipped regardless of how often this tick fires.
const OVERDUE_ALERT_INTERVAL_MS = 60 * 60 * 1000; // 60 minutes

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
    const { createAdminClient } = await import("@/lib/db");
    const admin = createAdminClient();
    const result = await sweepBackgroundJobs(admin);
    if (result.reclaimed || result.retried) {
      console.log(`[job-sweeper] reclaimed=${result.reclaimed} retried=${result.retried}`);
    }
  } catch (e) {
    console.error("[job-sweeper] sweep crashed", e);
  }
}

async function runOverdueAlertSweep(): Promise<void> {
  try {
    const { sweepOverdueAlerts } = await import("@/lib/complaints/overdue-alert-scheduler");
    const result = await sweepOverdueAlerts();
    if (result.queued || result.noAccountableOfficer || result.errors.length) {
      console.log(
        `[overdue-alert-sweeper] queued=${result.queued} alreadyHandledToday=${result.alreadyHandledToday} noAccountableOfficer=${result.noAccountableOfficer} errors=${result.errors.length}`,
      );
      for (const err of result.errors) console.error("[overdue-alert-sweeper]", err);
    }
  } catch (e) {
    console.error("[overdue-alert-sweeper] sweep crashed", e);
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

    if (!alreadyStarted(OVERDUE_ALERT_KEY)) {
      StartupLogger.info("Starting Overdue Alert Sweeper interval (60m)...");
      void runOverdueAlertSweep(); // Catch anything overdue since the process was down
      setInterval(() => void runOverdueAlertSweep(), OVERDUE_ALERT_INTERVAL_MS);
    } else {
      StartupLogger.info("Overdue Alert Sweeper already running.");
    }
  }
}
