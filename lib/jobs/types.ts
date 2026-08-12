import type { DbClient } from "../db";

/**
 * The enterprise background-job framework's shared types. One physical table
 * (background_jobs, migration 0022 + 0032) backs every job type registered
 * here — see lib/jobs/registry.ts for how a module plugs in and
 * lib/jobs/runner.ts for the claim/execute/retry/cancel mechanics.
 */

export type JobStatus = "queued" | "running" | "retrying" | "done" | "failed" | "cancelled";

/** Shared "is this task still in flight" check — one definition, used by the
 *  Task Registry's hooks and the Global Task Center alike. */
export const ACTIVE_JOB_STATUSES: ReadonlySet<JobStatus> = new Set(["queued", "running", "retrying"]);

/** Every job type the framework knows about. Add a new one here + register a
 *  handler and config in registry.ts — that's the only place a new module
 *  plugs in (no feature-specific background systems). */
export type JobType = "ai_draft" | "ocr" | "vision_scan" | "export" | "source_fetch" | "email_send";

/** What a handler is given to report progress and check for cancellation.
 *  `updateProgress`'s stage/message land in result.stage/result.message —
 *  no separate columns, so this stays compatible with how ai_draft already
 *  writes its live status into the same jsonb column. */
export interface JobHandlerContext<TInput = unknown> {
  admin: DbClient;
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
 *  closure state.
 *
 *  userId is nullable for the rare system-triggered job that no human
 *  started (e.g. the overdue-alert sweeper's queued email_send jobs) — there
 *  is no one to attribute it to or notify. dispatchJob skips the in-app
 *  notification for those and coerces to "" for the handler context, which
 *  every existing handler already tolerates since only a system job ever
 *  supplies it. */
export interface JobDispatchMeta {
  type: JobType;
  userId: string | null;
  title: string;
  entityType?: string | null;
  entityId?: string | null;
  link?: string | null;
}

/** The normalized shape every source (background_jobs directly, or an
 *  adapter over import_uploads / ack_import_batches — see lib/jobs/adapters.ts)
 *  is projected into for the Global Task Center to render uniformly, and for
 *  the frontend Task Registry (lib/jobs/client/*) to match tasks by identity. */
export interface TaskItem {
  id: string;
  source: "background_jobs" | "import_uploads" | "ack_import_batches";
  type: string;
  module: string;
  title: string;
  status: JobStatus;
  entityType: string | null;
  entityId: string | null;
  /** The specific action within `type` — e.g. an ai_draft job's draft kind.
   *  Derived from the job's own `input` at read time (see adaptBackgroundJob),
   *  never from `title` — a stable identity field, not a display string. */
  operation: string | null;
  /** A narrower disambiguator for tasks with no entityId yet (e.g. a
   *  vision_scan job's division, before any division-scoped entity exists). */
  subtype: string | null;
  progress: number | null;
  stage: string | null;
  message: string | null;
  /** The job's own result/progress payload, verbatim — `stage`/`message`
   *  above are the two fields every job shares, but a type's handler can
   *  report arbitrary structured extras of its own. Exposed generically so a
   *  consumer reads its own job type's fields directly off the shared
   *  registry instead of a second, type-specific poll. */
  result: unknown;
  error: string | null;
  cancellable: boolean;
  resultLink: string | null;
  createdAt: string;
  updatedAt: string | null;
  finishedAt: string | null;
}
