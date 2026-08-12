-- =============================================================================
-- 0004_complaints — Advanced Complaint Management System (Phase 3)
-- Target: Supabase Postgres. Run with: npm run db:migrate
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE IF NOT EXISTS / DROP ... IF EXISTS.
--
-- Extends the existing public.complaints table (0001 + 0003) into a full case-
-- managed complaint system and adds: complaint_documents (OCR/AI), timeline,
-- replies, action-taken, ocr_jobs, and a concurrency-safe case-number generator.
-- REUSES Phase-2 tables created in 0003 (communication_logs, escalation_logs,
-- ai_drafts, reminders, templates) — no duplication.
--
-- Supabase Storage buckets are created by `npm run db:setup-storage`
-- (scripts/setup-storage.ts, via the storage API) — NOT here.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- complaints — add advanced case-management columns (delta over 0003).
-- Existing reused columns: title→complaintTitle, type→complaintType,
-- date_submitted→complaintGivenDate, complaint_number→externalComplaintNumber,
-- status→currentStatus, priority, public_impact, complaint_mode→complaintFiledMode,
-- complaint_filed_to, acknowledgment_date, expected_resolution_date,
-- responsible_department, location→locationText, landmark, latitude, longitude,
-- escalation_level, description, citizen_satisfaction→satisfactionStatus,
-- reminder_flag→reminderEnabled, created_by/updated_by.
-- -----------------------------------------------------------------------------
alter table public.complaints add column if not exists internal_case_number text;
alter table public.complaints add column if not exists complaint_subtype text;
alter table public.complaints add column if not exists complaint_filed_by text;
alter table public.complaints add column if not exists requested_action text;
alter table public.complaints add column if not exists corporation_id uuid references public.corporations (id) on delete set null;
alter table public.complaints add column if not exists division_id uuid references public.divisions (id) on delete set null;
alter table public.complaints add column if not exists assigned_engineer_id uuid references public.contacts (id) on delete set null;
alter table public.complaints add column if not exists assigned_officer_id uuid references public.contacts (id) on delete set null;
alter table public.complaints add column if not exists latest_reply_summary text;
alter table public.complaints add column if not exists latest_reply_date date;
alter table public.complaints add column if not exists latest_action_taken_summary text;
alter table public.complaints add column if not exists latest_action_taken_date date;
alter table public.complaints add column if not exists next_follow_up_date date;
alter table public.complaints add column if not exists closure_date date;
alter table public.complaints add column if not exists closure_summary text;
alter table public.complaints add column if not exists deleted_at timestamptz;

create unique index if not exists complaints_internal_case_number_key
  on public.complaints (internal_case_number) where internal_case_number is not null;

-- -----------------------------------------------------------------------------
-- Migrate legacy lowercase type + UPPER status values to the new vocabularies,
-- then widen the CHECK constraints. CASE statements are idempotent.
-- -----------------------------------------------------------------------------
update public.complaints set type = case type
  when 'road' then 'Road'
  when 'drain' then 'Drain'
  when 'garbage' then 'Garbage'
  when 'streetlight' then 'Streetlight'
  when 'public-works' then 'Public Works'
  when 'bill' then 'Bill Payment'
  when 'contractor' then 'Contractor Issue'
  when 'RTI' then 'Other'
  when 'other' then 'Other'
  else type end;

update public.complaints set status = case status
  when 'DRAFT' then 'Draft'
  when 'SUBMITTED' then 'Filed'
  when 'UNDER_REVIEW' then 'Under Review'
  when 'REPLY_RECEIVED' then 'Reply Received'
  when 'ESCALATED' then 'Escalated'
  when 'CLOSED' then 'Closed'
  else status end;

alter table public.complaints drop constraint if exists complaints_type_check;
alter table public.complaints add constraint complaints_type_check check (type in (
  'Road','Drain','Garbage','Streetlight','Footpath','Park','Water Logging',
  'Encroachment','Building Violation','Public Works','Bill Payment',
  'Tender Irregularity','Contractor Issue','Health Issue','Revenue Issue',
  'Engineer Non Response','Ward Office Issue','Other'));

alter table public.complaints drop constraint if exists complaints_status_check;
alter table public.complaints add constraint complaints_status_check check (status in (
  'Draft','Filed','Acknowledged','Under Review','Assigned To Engineer',
  'Site Visit Pending','Site Visit Done','Work In Progress','Reply Received',
  'Action Taken Report Received','Partially Resolved','Resolved','Reopened',
  'Escalated','Converted To RTI','Closed','No Response','Overdue'));

alter table public.complaints alter column status set default 'Draft';

create index if not exists idx_complaints_division on public.complaints (division_id);
create index if not exists idx_complaints_corp on public.complaints (corporation_id);
create index if not exists idx_complaints_engineer on public.complaints (assigned_engineer_id);
create index if not exists idx_complaints_status2 on public.complaints (status);
create index if not exists idx_complaints_followup on public.complaints (next_follow_up_date);
create index if not exists idx_complaints_deleted on public.complaints (deleted_at);

-- -----------------------------------------------------------------------------
-- Concurrency-safe internal case number generator.
-- Format: <PREFIX>-<YYYY>-<000001>  e.g. DM-CMP-2026-000001
-- -----------------------------------------------------------------------------
create table if not exists public.complaint_counters (
  prefix text not null,
  year   integer not null,
  seq    integer not null default 0,
  primary key (prefix, year)
);
alter table public.complaint_counters enable row level security; -- no policies: only the definer fn writes

create or replace function public.next_complaint_case_number(p_prefix text, p_year integer)
returns text language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.complaint_counters (prefix, year, seq) values (p_prefix, p_year, 1)
    on conflict (prefix, year) do update set seq = public.complaint_counters.seq + 1
    returning seq into n;
  return p_prefix || '-' || p_year::text || '-' || lpad(n::text, 6, '0');
end; $$;

-- -----------------------------------------------------------------------------
-- complaint_documents — uploaded files + OCR + AI extraction
-- -----------------------------------------------------------------------------
create table if not exists public.complaint_documents (
  id                       uuid primary key default gen_random_uuid(),
  complaint_id             uuid not null references public.complaints (id) on delete cascade,
  document_type            text,
  title                    text,
  description              text,
  original_file_name       text,
  storage_bucket           text not null,
  storage_path             text not null,
  processed_storage_path   text,
  thumbnail_storage_path   text,
  public_url               text,
  private_url              text,
  mime_type                text,
  file_size                bigint,
  page_count               integer,
  uploaded_by              uuid references public.profiles (id) on delete set null,
  uploaded_at              timestamptz not null default now(),
  captured_date            date,
  document_date            date,
  source_person            text,
  source_department        text,
  source_office            text,
  ocr_status               text not null default 'Not Started',
  ocr_raw_text             text,
  ocr_clean_text           text,
  ocr_confidence           numeric,
  ocr_language             text,
  ai_summary               text,
  ai_extracted_json        jsonb,
  ai_suggested_status      text,
  ai_suggested_next_action text,
  ai_suggested_follow_up_date date,
  ai_confidence            text,
  verification_status      text not null default 'Pending Review',
  verified_by              uuid references public.profiles (id) on delete set null,
  verified_at              timestamptz,
  internal_notes           text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- complaint_timeline — chronological event log
-- -----------------------------------------------------------------------------
create table if not exists public.complaint_timeline (
  id                  uuid primary key default gen_random_uuid(),
  complaint_id        uuid not null references public.complaints (id) on delete cascade,
  event_type          text not null,
  event_date          timestamptz not null default now(),
  title               text,
  summary             text,
  related_document_id uuid references public.complaint_documents (id) on delete set null,
  related_officer_id  uuid references public.contacts (id) on delete set null,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- complaint_replies — dedicated reply tracking
-- -----------------------------------------------------------------------------
create table if not exists public.complaint_replies (
  id                    uuid primary key default gen_random_uuid(),
  complaint_id          uuid not null references public.complaints (id) on delete cascade,
  reply_date            date,
  reply_received_date   date,
  replied_by_name       text,
  replied_by_designation text,
  department            text,
  reply_mode            text,
  reply_summary         text,
  reply_full_text       text,
  document_id           uuid references public.complaint_documents (id) on delete set null,
  is_satisfactory       boolean,
  issues_remaining      text,
  next_action_suggested text,
  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- complaint_action_taken — dedicated action-taken tracking
-- -----------------------------------------------------------------------------
create table if not exists public.complaint_action_taken (
  id                       uuid primary key default gen_random_uuid(),
  complaint_id             uuid not null references public.complaints (id) on delete cascade,
  action_taken_date        date,
  action_reported_date     date,
  action_taken_by_name     text,
  action_taken_by_designation text,
  department               text,
  action_summary           text,
  action_details           text,
  work_completed           boolean,
  site_visited             boolean,
  photo_evidence_available boolean,
  document_id              uuid references public.complaint_documents (id) on delete set null,
  user_satisfaction        text,
  pending_work             text,
  next_action_required     text,
  created_by               uuid references public.profiles (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- ocr_jobs — queue for deferred / retried OCR
-- -----------------------------------------------------------------------------
create table if not exists public.ocr_jobs (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.complaint_documents (id) on delete cascade,
  status        text not null default 'Queued',
  attempts      integer not null default 0,
  error_message text,
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Extend Phase-2 shared tables for complaint workflow (reuse, don't duplicate).
-- -----------------------------------------------------------------------------
alter table public.communication_logs add column if not exists officer_id uuid references public.contacts (id) on delete set null;
alter table public.communication_logs add column if not exists phone_or_email text;
alter table public.communication_logs add column if not exists next_action_date date;
alter table public.communication_logs add column if not exists document_id uuid references public.complaint_documents (id) on delete set null;

alter table public.reminders add column if not exists reminder_type text;

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
create index if not exists idx_cdoc_complaint   on public.complaint_documents (complaint_id);
create index if not exists idx_cdoc_ocr_status  on public.complaint_documents (ocr_status);
create index if not exists idx_cdoc_verif       on public.complaint_documents (verification_status);
create index if not exists idx_ctl_complaint    on public.complaint_timeline (complaint_id, event_date desc);
create index if not exists idx_creply_complaint on public.complaint_replies (complaint_id);
create index if not exists idx_cact_complaint   on public.complaint_action_taken (complaint_id);
create index if not exists idx_ocrjobs_status   on public.ocr_jobs (status);
create index if not exists idx_ocrjobs_document on public.ocr_jobs (document_id);

-- -----------------------------------------------------------------------------
-- updated_at triggers (reuse public.set_updated_at from 0001)
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['complaint_documents','complaint_replies',
                           'complaint_action_taken','ocr_jobs'] loop
    execute format('drop trigger if exists trg_updated_at on public.%I', t);
    execute format('create trigger trg_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Row Level Security
--   Accountability records (timeline, replies, action-taken) are PUBLIC-read
--   like complaints. complaint_documents + ocr_jobs are AUTHENTICATED-read
--   (raw OCR / internal notes; the files themselves live in PRIVATE storage and
--   are only reachable via server-issued signed URLs). Internal notes are
--   additionally hidden in the UI for the Viewer role.
--   Writes: can_write() insert, can_verify() update, is_admin() delete.
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  -- PUBLIC-read
  foreach t in array array['complaint_timeline','complaint_replies','complaint_action_taken'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s_read" on public.%I', t, t);
    execute format('create policy "%s_read" on public.%I for select using (true)', t, t);
    execute format('drop policy if exists "%s_insert" on public.%I', t, t);
    execute format('create policy "%s_insert" on public.%I for insert with check (public.can_write())', t, t);
    execute format('drop policy if exists "%s_update" on public.%I', t, t);
    execute format('create policy "%s_update" on public.%I for update using (public.can_verify()) with check (public.can_verify())', t, t);
    execute format('drop policy if exists "%s_delete" on public.%I', t, t);
    execute format('create policy "%s_delete" on public.%I for delete using (public.is_admin())', t, t);
  end loop;

  -- AUTH-read
  foreach t in array array['complaint_documents','ocr_jobs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s_read" on public.%I', t, t);
    execute format('create policy "%s_read" on public.%I for select using (auth.uid() is not null)', t, t);
    execute format('drop policy if exists "%s_insert" on public.%I', t, t);
    execute format('create policy "%s_insert" on public.%I for insert with check (public.can_write())', t, t);
    execute format('drop policy if exists "%s_update" on public.%I', t, t);
    execute format('create policy "%s_update" on public.%I for update using (public.can_verify()) with check (public.can_verify())', t, t);
    execute format('drop policy if exists "%s_delete" on public.%I', t, t);
    execute format('create policy "%s_delete" on public.%I for delete using (public.is_admin())', t, t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- app_settings — complaint module configuration (admin-editable; see 0003 RLS)
-- -----------------------------------------------------------------------------
insert into public.app_settings (key, value) values
  ('complaint_settings', jsonb_build_object(
    'caseNumberPrefix', 'DM-CMP',          -- DM-CMP | GBA-CMP | BBMP-CMP | CUSTOM
    'startingSequence', 1,
    'followUpDaysAfterFiling', 7,
    'followUpDaysAfterReply', 3,
    'siteVerificationDaysAfterAction', 2,
    'ocrLanguage', 'eng+kan',              -- eng | kan | eng+kan
    'ocrAutoRun', true,
    'aiAutoSummary', true,
    'maxUploadMb', 15,
    'documentsPrivateByDefault', true
  ))
on conflict (key) do nothing;
