-- =============================================================================
-- 0016_job_import — BBMP IFMS portal import ("job cases").
--   A job case is a PRE-COMPLAINT container for documents downloaded from the
--   public IFMS portal, keyed by job code (ddd-yy-nnnnnn). Documents land in
--   job_documents (mirrors the columns lib/actions/job-audit.ts reads from
--   complaint_documents) so the forensic audit runs without a complaint. A job
--   case is later CONVERTED to a complaint (job_cases.complaint_id).
--   job_download_runs tracks a (resumable) download batch for UI progress.
--   Idempotent (CREATE IF NOT EXISTS). RLS loop mirrors 0008_job_audit.
--   Run with: npm run db:migrate
-- =============================================================================

-- Download batch (drives the portal UI progress bar; resumable via cursor) --------
create table if not exists public.job_download_runs (
  id uuid primary key default gen_random_uuid(),
  selector_kind text,                       -- code | wardyear | mixed
  selector_value text,                      -- the raw user input
  status text not null default 'running',   -- running | done | error | cancelled
  codes jsonb not null default '[]'::jsonb,  -- resolved job-code queue
  cursor integer not null default 0,         -- next index into codes (resume)
  jobs_found integer not null default 0,
  jobs_done integer not null default 0,
  files_downloaded integer not null default 0,
  files_failed integer not null default 0,
  log jsonb not null default '[]'::jsonb,
  error text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_job_download_runs_created on public.job_download_runs (created_at desc);

-- One job case per downloaded job code -------------------------------------------
create table if not exists public.job_cases (
  id uuid primary key default gen_random_uuid(),
  job_number text not null unique,
  ward text,
  year text,
  serial text,
  description text,
  contractor text,
  gross_amount numeric,
  deduction numeric,
  net_amount numeric,
  br_number text,
  wo_id text,
  bill_ids text,
  wo_ref text,
  source text not null default 'ifms_portal',
  status text not null default 'downloaded',  -- downloaded | audited | converted
  file_count integer not null default 0,
  complaint_id uuid references public.complaints (id) on delete set null,
  download_run_id uuid references public.job_download_runs (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_job_cases_status on public.job_cases (status);
create index if not exists idx_job_cases_created on public.job_cases (created_at desc);

-- One row per downloaded file (mirrors complaint_documents for the audit) ---------
create table if not exists public.job_documents (
  id uuid primary key default gen_random_uuid(),
  job_case_id uuid not null references public.job_cases (id) on delete cascade,
  job_number text not null,
  document_type text,
  original_file_name text,
  title text,
  storage_bucket text,
  storage_path text,
  mime_type text,
  file_size integer,
  page_count integer not null default 1,
  source text not null default 'ifms_portal',
  is_blank_template boolean not null default false,
  -- OCR
  ocr_status text not null default 'Queued',  -- Queued | Processing | Completed | Failed | Needs Manual Review | Skipped
  ocr_language text,
  ocr_raw_text text,
  ocr_clean_text text,
  ocr_confidence integer,
  -- AI extraction
  ai_summary text,
  ai_extracted_json jsonb,
  -- fingerprint + photo forensics (same shape as complaint_documents)
  file_sha256 text,
  phash text,
  dhash text,
  exif_gps_lat double precision,
  exif_gps_lon double precision,
  exif_taken_at timestamptz,
  photo_stage text,
  geo_flag text,
  geo_distance_m double precision,
  is_duplicate boolean not null default false,
  dup_severity text,
  dup_matches jsonb,
  vision_verdict text,
  vision_json jsonb,
  vision_checked_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_job_documents_case on public.job_documents (job_case_id);
create index if not exists idx_job_documents_job on public.job_documents (job_number);
create index if not exists idx_job_documents_ocr on public.job_documents (ocr_status);
-- Resume guard: a file is identified within a job by its original filename.
create unique index if not exists uq_job_documents_job_file
  on public.job_documents (job_number, original_file_name);

-- updated_at triggers (reuse public.set_updated_at from 0001) ---------------------
do $$
declare t text;
begin
  foreach t in array array['job_download_runs','job_cases','job_documents'] loop
    execute format('drop trigger if exists trg_%s_updated on public.%I', t, t);
    execute format('create trigger trg_%s_updated before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- Row Level Security — public read (civic transparency, like job_audits);
-- writes can_write(), deletes admin-only. Mirrors the 0008_job_audit loop.
do $$
declare t text;
begin
  foreach t in array array['job_download_runs','job_cases','job_documents'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select using (true)', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format('create policy %I_write on public.%I for insert with check (public.can_write())', t, t);
    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format('create policy %I_update on public.%I for update using (public.can_write())', t, t);
    execute format('drop policy if exists %I_delete on public.%I', t, t);
    execute format('create policy %I_delete on public.%I for delete using (public.is_admin())', t, t);
  end loop;
end $$;
