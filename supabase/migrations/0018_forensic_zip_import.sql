-- -----------------------------------------------------------------------------
-- 0018_forensic_zip_import — refresh-safe "forensic ZIP" import staging.
--   One row per uploaded ZIP whose top-level folders are each named a job code
--   (ddd-yy-nnnnnn) and hold that job's forensic-audit-skill output (extracted
--   text, minimum-dataset JSON, the drafted Kannada complaint letter, logs, …).
--   Inventory + parse runs in the background (Next `after()`), writing the
--   per-job result here, so the browser can poll for status and re-attach after
--   a page refresh. Transient working data; the raw ZIP lives in object storage.
--
--   Also adds division context to job_cases (the skill JSON carries
--   zone/division/sub_division) — used by the importer and by the cross-job
--   duplicate-photo grouping (0020).
--
--   Idempotent (CREATE / ADD … IF NOT EXISTS). Run with: npm run db:migrate
-- -----------------------------------------------------------------------------

create table if not exists public.forensic_import_batches (
  id                    uuid primary key default gen_random_uuid(),
  status                text not null default 'Processing', -- Processing | Ready | Committed | Failed
  storage_path          text not null,                      -- raw ZIP held in R2 (forensic/_imports/…)
  original_file_name    text,
  zip_size              bigint,
  folder_count          integer,
  jobs                  jsonb,                              -- ForensicJobResult[] once parse completes
  created_case_ids      jsonb,                              -- uuid[] of job_cases created on commit
  created_complaint_ids jsonb,                              -- uuid[] of complaints created on commit
  error                 text,
  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_forensic_import_batches_creator on public.forensic_import_batches (created_by);
create index if not exists idx_forensic_import_batches_status  on public.forensic_import_batches (status);
create index if not exists idx_forensic_import_batches_created on public.forensic_import_batches (created_at desc);

-- updated_at trigger (reuse public.set_updated_at from 0001)
drop trigger if exists trg_updated_at on public.forensic_import_batches;
create trigger trg_updated_at before update on public.forensic_import_batches
  for each row execute function public.set_updated_at();

-- Row Level Security — staff-only working data (mirrors rti_import_batches, 0017).
-- The background runner writes via the service-role admin client (bypasses RLS).
alter table public.forensic_import_batches enable row level security;

drop policy if exists "forensic_import_batches_read" on public.forensic_import_batches;
create policy "forensic_import_batches_read" on public.forensic_import_batches for select using (public.can_write());

drop policy if exists "forensic_import_batches_insert" on public.forensic_import_batches;
create policy "forensic_import_batches_insert" on public.forensic_import_batches for insert with check (public.can_write());

drop policy if exists "forensic_import_batches_update" on public.forensic_import_batches;
create policy "forensic_import_batches_update" on public.forensic_import_batches for update using (public.can_write()) with check (public.can_write());

drop policy if exists "forensic_import_batches_delete" on public.forensic_import_batches;
create policy "forensic_import_batches_delete" on public.forensic_import_batches for delete using (public.is_admin());

-- job_cases: division context (from the skill's minimum-dataset JSON). ----------
alter table public.job_cases add column if not exists zone         text;
alter table public.job_cases add column if not exists division     text;
alter table public.job_cases add column if not exists sub_division text;
create index if not exists idx_job_cases_division on public.job_cases (division) where division is not null;

notify pgrst, 'reload schema';
