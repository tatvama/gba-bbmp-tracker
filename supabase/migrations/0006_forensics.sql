-- =============================================================================
-- 0006_forensics — Advanced forensics (vision AI, geofence, contractor risk)
-- Target: Supabase Postgres. Run with: npm run db:migrate
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE IF NOT EXISTS.
--
-- Adds: a structured contractor on complaints (risk scoring), and per-document
-- vision-AI verdict + geofence columns. Bill forensics + PIL bundle reuse
-- existing data/AI and need no new columns.
-- =============================================================================

-- complaints: structured contractor (for per-contractor risk scoring) ----------
alter table public.complaints add column if not exists contractor text;
create index if not exists idx_complaints_contractor
  on public.complaints (contractor) where contractor is not null;

-- complaint_documents: vision-AI verdict + geofence ----------------------------
alter table public.complaint_documents add column if not exists vision_verdict   text;   -- ok | suspect | mismatch | not_site_photo
alter table public.complaint_documents add column if not exists vision_json      jsonb;  -- full structured vision result
alter table public.complaint_documents add column if not exists vision_checked_at timestamptz;
alter table public.complaint_documents add column if not exists geo_flag         text;   -- ok | far | no_gps | no_reference
alter table public.complaint_documents add column if not exists geo_distance_m   double precision;

create index if not exists idx_cdoc_vision on public.complaint_documents (vision_verdict) where vision_verdict is not null;
create index if not exists idx_cdoc_geo    on public.complaint_documents (geo_flag) where geo_flag is not null;

-- Configurable forensics thresholds (merged over code defaults).
insert into public.app_settings (key, value)
values ('forensics_rules', '{"geofenceMaxMeters":300}'::jsonb)
on conflict (key) do nothing;
