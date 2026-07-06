-- -----------------------------------------------------------------------------
-- 0032_background_job_lifecycle — generalizes background_jobs (0022) from a
--   single-purpose "AI draft" ledger into the enterprise-wide background job
--   framework's ledger (lib/jobs/*). No new table — background_jobs already
--   has everything a job needs (type, status, progress, input, result, error,
--   entity_type/entity_id, created_by, timestamps); this just adds the columns
--   needed for real retry-with-backoff, cancellation, and priority, plus a
--   DB-level duplicate-job guard so "reconnect to the existing job instead of
--   starting a second one" is an actual constraint, not just an app-level check.
--
--   NOTE ON RE-RUNS: scripts/migrate.ts re-applies every file — everything
--   here must be idempotent.
-- -----------------------------------------------------------------------------

alter table public.background_jobs add column if not exists cancel_requested boolean not null default false;
alter table public.background_jobs add column if not exists priority integer not null default 0;
alter table public.background_jobs add column if not exists retry_count integer not null default 0;
alter table public.background_jobs add column if not exists max_retries integer not null default 3;
alter table public.background_jobs add column if not exists next_retry_at timestamptz;

-- Widen the status check from 0022's (queued,running,done,failed) to add
-- 'retrying' and 'cancelled'. The inline check on the column in 0022 got
-- Postgres's default auto-generated name (<table>_<column>_check) — drop
-- that exact name (safe no-op if it's already been replaced by a prior run
-- of this file) then add back a stably-named one.
alter table public.background_jobs drop constraint if exists background_jobs_status_check;
alter table public.background_jobs
  add constraint background_jobs_status_check
  check (status in ('queued','running','retrying','done','failed','cancelled'));

-- Duplicate-job prevention: only one queued/running job per (type, entity)
-- at a time. startJob() (lib/jobs/runner.ts) catches the unique-violation and
-- returns the existing job's id instead — "reconnect to the existing job" is
-- a real DB constraint, not a check-then-insert race.
create unique index if not exists idx_bg_jobs_dedupe
  on public.background_jobs (type, entity_type, entity_id)
  where status in ('queued', 'running');

-- Sweep indexes (lib/jobs/runner.ts's sweepBackgroundJobs, wired into
-- instrumentation.ts): dead-job recovery scans 'running' rows by staleness,
-- the retry sweep scans 'retrying' rows by due time.
create index if not exists idx_bg_jobs_running_stale on public.background_jobs (status, updated_at) where status = 'running';
create index if not exists idx_bg_jobs_retry_due on public.background_jobs (next_retry_at) where status = 'retrying';

comment on column public.background_jobs.cancel_requested is
  'Set by cancelJobAction; a running handler cooperatively checks this via JobHandlerContext.isCancelled() between loop iterations (single-process Node cannot forcibly kill an in-flight async function).';
comment on column public.background_jobs.priority is
  'Higher claims first. Default 0 for every job type today; the column exists so a future job type can jump the queue without a schema change.';
comment on column public.background_jobs.retry_count is
  'Automatic retries only (transient errors matching a job type''s retryableErrorPatterns) — a manual Retry-button click resets this to 0, it is not a lifetime attempt counter.';
comment on column public.background_jobs.next_retry_at is
  'When status=retrying, the exponential-backoff-computed time the sweep should re-dispatch this job. Null otherwise.';

notify pgrst, 'reload schema';
