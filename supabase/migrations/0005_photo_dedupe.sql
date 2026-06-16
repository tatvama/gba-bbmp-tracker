-- =============================================================================
-- 0005_photo_dedupe — Duplicate-photo detection (anti-fraud)
-- Target: Supabase Postgres. Run with: npm run db:migrate
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE IF NOT EXISTS.
--
-- Adds a structured government job/work code to complaints, and image
-- fingerprint + EXIF + duplicate-flag columns to complaint_documents, so the
-- same photo reused across different roads / job numbers (typically within one
-- engineering division) can be detected and surfaced. Hashes are stored as
-- 16-char hex TEXT (not bigint) to avoid PostgREST 64-bit precision loss.
-- =============================================================================

-- complaints: government contract job / work code -----------------------------
alter table public.complaints add column if not exists job_number text;
create index if not exists idx_complaints_job_number
  on public.complaints (job_number) where job_number is not null;

-- complaint_documents: fingerprint + EXIF + duplicate flag ---------------------
alter table public.complaint_documents add column if not exists file_sha256   text;
alter table public.complaint_documents add column if not exists phash         text;   -- 16-hex (64-bit) perceptual hash
alter table public.complaint_documents add column if not exists dhash         text;   -- 16-hex (64-bit) difference hash
alter table public.complaint_documents add column if not exists exif_gps_lat  double precision;
alter table public.complaint_documents add column if not exists exif_gps_lon  double precision;
alter table public.complaint_documents add column if not exists exif_taken_at timestamptz;
alter table public.complaint_documents add column if not exists photo_stage   text;   -- before | during | after | na
alter table public.complaint_documents add column if not exists is_duplicate  boolean not null default false;
alter table public.complaint_documents add column if not exists dup_severity  text;   -- High | Medium | Low
alter table public.complaint_documents add column if not exists dup_matches   jsonb;  -- [{documentId, jobNumber, caseNumber, road, division, severity, sameDivision}]
alter table public.complaint_documents add column if not exists dup_checked_at timestamptz;

create index if not exists idx_cdoc_sha256 on public.complaint_documents (file_sha256) where file_sha256 is not null;
create index if not exists idx_cdoc_phash  on public.complaint_documents (phash)       where phash is not null;
create index if not exists idx_cdoc_dhash  on public.complaint_documents (dhash)       where dhash is not null;
create index if not exists idx_cdoc_gps    on public.complaint_documents (exif_gps_lat, exif_gps_lon) where exif_gps_lat is not null;
create index if not exists idx_cdoc_dupe   on public.complaint_documents (is_duplicate) where is_duplicate;

-- Configurable thresholds (merged over code defaults in lib/settings.ts).
insert into public.app_settings (key, value)
values ('photo_dedupe_rules', '{"phashMax":10,"dhashMax":10,"strictMax":6,"gpsEpsilon":0.0002}'::jsonb)
on conflict (key) do nothing;
