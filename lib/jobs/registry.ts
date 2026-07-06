import type { JobConfig, JobHandler, JobType } from "./types";

/**
 * The ONE place a module plugs into the background-job framework: an entry
 * here, plus a handler function passed to registerJobHandler() from that
 * module's own file (kept out of this file so lib/jobs/ never needs to import
 * feature code — feature code imports lib/jobs/, never the other way).
 *
 * Config is defined for every type up front (even before stage 5-8 register
 * their handlers) because the dead-job-recovery sweep (lib/jobs/runner.ts)
 * needs a maxDurationMs for every type that might ever be 'running'.
 */

const RETRYABLE_TRANSIENT = [/rate.?limit/i, /timeout/i, /ECONNRESET/i, /fetch failed/i, /\b529\b/, /overloaded/i, /ETIMEDOUT/i];

export const JOB_CONFIG: Record<JobType, JobConfig> = {
  ai_draft: { maxDurationMs: 3 * 60_000, maxRetries: 2, retryableErrorPatterns: RETRYABLE_TRANSIENT, concurrencyLimit: 3 },
  ocr: { maxDurationMs: 5 * 60_000, maxRetries: 2, retryableErrorPatterns: RETRYABLE_TRANSIENT, concurrencyLimit: 2 },
  vision_scan: { maxDurationMs: 15 * 60_000, maxRetries: 1, retryableErrorPatterns: RETRYABLE_TRANSIENT, concurrencyLimit: 1 },
  export: { maxDurationMs: 3 * 60_000, maxRetries: 2, retryableErrorPatterns: RETRYABLE_TRANSIENT, concurrencyLimit: 2 },
  ifms_download: { maxDurationMs: 30 * 60_000, maxRetries: 1, retryableErrorPatterns: RETRYABLE_TRANSIENT, concurrencyLimit: 1 },
};

const handlers: Partial<Record<JobType, JobHandler>> = {};

/** Called once, at module-load time, by each feature's own job-handler file
 *  (e.g. lib/actions/jobs.ts calls this for "ai_draft"). */
export function registerJobHandler(type: JobType, handler: JobHandler): void {
  handlers[type] = handler;
}

export function getJobHandler(type: string): JobHandler | undefined {
  return handlers[type as JobType];
}

export function getJobConfig(type: string): JobConfig | undefined {
  return JOB_CONFIG[type as JobType];
}

export function allJobTypes(): JobType[] {
  return Object.keys(JOB_CONFIG) as JobType[];
}
