import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The enterprise background-job framework's shared types. One physical table
 * (background_jobs, migration 0022 + 0032) backs every job type registered
 * here — see lib/jobs/registry.ts for how a module plugs in and
 * lib/jobs/runner.ts for the claim/execute/retry/cancel mechanics.
 */

export type JobStatus = "queued" | "running" | "retrying" | "done" | "failed" | "cancelled";

/** Every job type the framework knows about. Add a new one here + register a
 *  handler and config in registry.ts — that's the only place a new module
 *  plugs in (no feature-specific background systems). */
export type JobType = "ai_draft" | "ocr" | "vision_scan" | "export" | "ifms_download";

/** What a handler is given to report progress and check for cancellation.
 *  `updateProgress`'s stage/message land in result.stage/result.message —
 *  no separate columns, so this stays compatible with how ai_draft already
 *  writes its live status into the same jsonb column. */
export interface JobHandlerContext<TInput = unknown> {
  admin: SupabaseClient;
  jobId: string;
  /** The user who started (or, for a retry, originally started) the job —
   *  for handlers that need it on their own business-logic writes (e.g.
   *  created_by on a row the handler inserts). */
  userId: string;
  /** The exact `input` the job was started with (startJob's opts.input),
   *  re-read from the row at claim time rather than threaded through a
   *  closure — so a job re-dispatched later (manual retry, the due-retry
   *  sweep) works identically to its first run with no separate code path. */
  input: TInput;
  updateProgress: (progress: number, stage?: string, message?: string, extra?: Record<string, unknown>) => Promise<void>;
  isCancelled: () => Promise<boolean>;
}

export interface JobHandlerOutcome {
  result?: unknown;
  error?: string;
  /** Override the type's default retryableErrorPatterns classification for
   *  this specific failure (e.g. a handler that already knows "this was a
   *  rate limit, definitely retry" or "this was bad input, never retry"). */
  retryable?: boolean;
}

export type JobHandler = (ctx: JobHandlerContext) => Promise<JobHandlerOutcome>;

export interface JobConfig {
  /** A 'running' job older than this (updated_at) is presumed dead — the
   *  boot/interval sweep marks it failed with a timeout error. */
  maxDurationMs: number;
  maxRetries: number;
  /** Error messages matching any of these are treated as transient (auto-retry
   *  with backoff) unless the handler's own outcome.retryable overrides it. */
  retryableErrorPatterns: RegExp[];
  /** Max jobs of this type running at once, process-wide. */
  concurrencyLimit: number;
}

/** Metadata needed to (re)dispatch a job — stored redundantly on the job row
 *  itself so a retry or a sweep pickup doesn't need the original caller's
 *  closure state. */
export interface JobDispatchMeta {
  type: JobType;
  userId: string;
  title: string;
  entityType?: string | null;
  entityId?: string | null;
  link?: string | null;
}

/** The normalized shape every source (background_jobs directly, or an
 *  adapter over import_uploads / ack_import_batches — see lib/jobs/adapters.ts)
 *  is projected into for the Global Task Center to render uniformly. */
export interface TaskItem {
  id: string;
  source: "background_jobs" | "import_uploads" | "ack_import_batches";
  type: string;
  module: string;
  title: string;
  status: JobStatus;
  entityType: string | null;
  entityId: string | null;
  progress: number | null;
  stage: string | null;
  message: string | null;
  error: string | null;
  cancellable: boolean;
  resultLink: string | null;
  createdAt: string;
  updatedAt: string | null;
  finishedAt: string | null;
}
