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

/** SMTP transients: connection-level faults and Gmail's 4xx "try again later"
 *  codes. Notably absent is EAUTH — see the email_send config comment. */
const RETRYABLE_SMTP = [
  /timeout/i, /ETIMEDOUT/i, /ECONNRESET/i, /ECONNREFUSED/i, /EPIPE/i, /ESOCKET/i, /EDNS/i, /ENOTFOUND/i,
  /\b4\d\d[\s-]/, /rate.?limit/i, /too many/i, /try again/i, /temporarily/i,
];

export const JOB_CONFIG: Record<JobType, JobConfig> = {
  ai_draft: { maxDurationMs: 3 * 60_000, maxRetries: 2, retryableErrorPatterns: RETRYABLE_TRANSIENT, concurrencyLimit: 3 },
  ocr: { maxDurationMs: 5 * 60_000, maxRetries: 2, retryableErrorPatterns: RETRYABLE_TRANSIENT, concurrencyLimit: 2 },
  vision_scan: { maxDurationMs: 15 * 60_000, maxRetries: 1, retryableErrorPatterns: RETRYABLE_TRANSIENT, concurrencyLimit: 1 },
  export: { maxDurationMs: 3 * 60_000, maxRetries: 2, retryableErrorPatterns: RETRYABLE_TRANSIENT, concurrencyLimit: 2 },
  // account.bbmpgov.in is a single shared government server — concurrencyLimit
  // 1 for the same politeness reasoning vision_scan uses for its own single
  // shared (AI vision) endpoint. A ward+year expansion can walk up to 2000
  // serials (lib/ifms/downloader.ts's expandWardYear), hence the long budget.
  source_fetch: { maxDurationMs: 20 * 60_000, maxRetries: 1, retryableErrorPatterns: RETRYABLE_TRANSIENT, concurrencyLimit: 1 },
  // Gmail SMTP. concurrencyLimit 1 because every message authenticates as the
  // same single mailbox and Google throttles parallel sessions from one account.
  //
  // NOTE these patterns are a fallback only. decideRetry resolves
  // `explicitRetryable ?? patterns.some(...)` (lib/jobs/retry-policy.ts) and the
  // email_send handler ALWAYS returns an explicit flag, computed from the SMTP
  // reply code by lib/mail/smtp-errors.ts. Editing this list will not change
  // email retry behaviour — change isPermanentSmtpError instead.
  email_send: { maxDurationMs: 2 * 60_000, maxRetries: 3, retryableErrorPatterns: RETRYABLE_SMTP, concurrencyLimit: 1 },
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
