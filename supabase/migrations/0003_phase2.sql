-- =============================================================================
-- 0003_phase2 — RTI, Complaint, Engineer & Follow-up portal (Phase 2)
-- Target: Supabase Postgres. Run with: npm run db:migrate
-- Idempotent: safe to re-run (IF NOT EXISTS / DROP ... IF EXISTS / ADD COLUMN IF NOT EXISTS).
--
-- This migration creates EVERY Phase 2 table up front (RTI is built first; later
-- slices — complaints, officers, reminders UI — add only code, no schema rework).
-- Conventions mirror 0001_init.sql: gen_random_uuid() PKs, created_by/updated_by
-- → profiles, set_updated_at trigger, public/role-gated RLS via can_write()/
-- can_verify()/is_admin().
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Expanded roles. Phase 1 had ADMIN/EDITOR/VERIFIER/VIEWER; Phase 2 adds
-- domain managers + field officers. can_write()/can_verify() are updated so RLS
-- (defence-in-depth) admits them; server actions still enforce per-domain rules.
-- -----------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('ADMIN','EDITOR','VERIFIER','VIEWER',
                  'RTI_MANAGER','COMPLAINT_MANAGER','FIELD_OFFICER'));

create or replace function public.can_write()
returns boolean language sql stable as $$
  select public.user_role() in ('ADMIN','EDITOR','RTI_MANAGER','COMPLAINT_MANAGER');
$$;

create or replace function public.can_verify()
returns boolean language sql stable as $$
  select public.user_role() in ('ADMIN','EDITOR','VERIFIER',
                                'RTI_MANAGER','COMPLAINT_MANAGER','FIELD_OFFICER');
$$;

-- -----------------------------------------------------------------------------
-- app_settings — key/value config. Holds the CONFIGURABLE RTI deadline rules so
-- the law/rules can change without code edits (spec). Admin-writable, public-read.
-- -----------------------------------------------------------------------------
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('rti_deadline_rules', jsonb_build_object(
    'normalDays', 30,            -- normal RTI response
    'lifeLibertyHours', 48,      -- life/liberty cases
    'firstAppealDays', 30,       -- first appeal after expiry/unsatisfactory reply
    'secondAppealDays', 90,      -- second appeal after FAA decision/should-have-been
    'faaDisposalDays', 30,       -- FAA disposal target
    'faaDisposalMaxDays', 45,    -- FAA disposal extendable max
    'dueSoonDays', 10,           -- "due soon" threshold for badges
    'criticalOverdueDays', 7     -- overdue beyond this => "critical overdue"
  ))
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- rti_applications — the headline RTI lifecycle record.
-- -----------------------------------------------------------------------------
create table if not exists public.rti_applications (
  id                    uuid primary key default gen_random_uuid(),
  internal_ref          text unique,
  -- applicant
  applicant_name        text,
  applicant_address     text,
  applicant_phone       text,
  applicant_email       text,
  -- public authority / PIO / FAA
  public_authority      text,
  department            text,
  office_address        text,
  pio_name              text,
  pio_designation       text,
  pio_phone             text,
  pio_email             text,
  faa_name              text,
  faa_designation       text,
  faa_phone             text,
  faa_email             text,
  -- jurisdiction (links into the Phase 1 structure)
  corporation_id        uuid references public.corporations (id) on delete set null,
  division_id           uuid references public.divisions (id) on delete set null,
  eng_subdivision_id    uuid references public.eng_subdivisions (id) on delete set null,
  ward_id               uuid references public.wards (id) on delete set null,
  contact_id            uuid references public.contacts (id) on delete set null,
  -- content
  subject               text not null,
  info_requested        text,
  category              text,    -- one of RTI_CATEGORIES (NULL allowed)
  filing_mode           text,    -- one of RTI_FILING_MODES
  application_fee_paid   boolean not null default false,
  fee_mode              text,
  postal_receipt_no     text,
  online_reg_no         text,
  -- lifecycle dates (computed deadlines stored for fast filtering/sorting)
  date_drafted          date,
  date_filed            date,
  date_received         date,
  is_life_liberty       boolean not null default false,
  normal_due            date,
  life_liberty_due      date,
  first_appeal_due      date,
  second_appeal_due     date,
  -- status + reply
  status                text not null default 'Draft',
  reply_summary         text,
  reply_date            date,
  reply_attachment      text,
  satisfaction_status   text,    -- one of RTI_SATISFACTION
  -- workflow
  next_action           text,
  next_action_date      date,
  reminder_enabled      boolean not null default false,
  priority              text not null default 'Medium',
  tags                  text[] not null default '{}',
  internal_notes        text,
  public_notes          text,
  created_by            uuid references public.profiles (id) on delete set null,
  updated_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- rti_first_appeals
-- -----------------------------------------------------------------------------
create table if not exists public.rti_first_appeals (
  id               uuid primary key default gen_random_uuid(),
  rti_id           uuid not null references public.rti_applications (id) on delete cascade,
  faa_name         text,
  faa_designation  text,
  faa_phone        text,
  faa_email        text,
  grounds          text[] not null default '{}',
  grounds_detail   text,
  date_drafted     date,
  date_filed       date,
  faa_order_due    date,
  faa_order_date   date,
  decision_summary text,
  status           text not null default 'Draft',
  attachments      text,
  notes            text,
  created_by       uuid references public.profiles (id) on delete set null,
  updated_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- rti_second_appeals (to the Information Commission) + complaint tracking
-- -----------------------------------------------------------------------------
create table if not exists public.rti_second_appeals (
  id                  uuid primary key default gen_random_uuid(),
  rti_id              uuid not null references public.rti_applications (id) on delete cascade,
  first_appeal_id     uuid references public.rti_first_appeals (id) on delete set null,
  commission_name     text,
  reason              text[] not null default '{}',
  reason_detail       text,
  filing_date         date,
  diary_number        text,
  hearing_date        date,
  hearing_status      text,
  order_date          date,
  order_summary       text,
  compliance_due_date date,
  compliance_status   text,
  status              text not null default 'Draft',
  notes               text,
  created_by          uuid references public.profiles (id) on delete set null,
  updated_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- hearings — commission / appeal hearings (polymorphic)
-- -----------------------------------------------------------------------------
create table if not exists public.hearings (
  id              uuid primary key default gen_random_uuid(),
  entity_type     text not null,  -- 'second_appeal' | 'first_appeal' | 'rti'
  entity_id       uuid not null,
  commission_name text,
  hearing_date    date,
  hearing_time    time,
  status          text,
  outcome         text,
  next_date       date,
  notes           text,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- officer_transfers — TransferHistory (officer = a contacts row)
-- -----------------------------------------------------------------------------
create table if not exists public.officer_transfers (
  id                  uuid primary key default gen_random_uuid(),
  officer_id          uuid not null references public.contacts (id) on delete cascade,
  prev_corporation    text,
  prev_division       text,
  prev_subdivision    text,
  prev_ward           text,
  new_corporation     text,
  new_division        text,
  new_subdivision     text,
  new_ward            text,
  transfer_order_no   text,
  transfer_order_date date,
  effective_date      date,
  source_document     text,
  notes               text,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- reminders — smart follow-up reminders (polymorphic entity)
-- -----------------------------------------------------------------------------
create table if not exists public.reminders (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null
               check (entity_type in ('rti','complaint','officer','appeal','hearing','general')),
  entity_id    uuid,
  title        text not null,
  description  text,
  due_date     date,
  due_time     time,
  priority     text not null default 'Medium',
  status       text not null default 'Pending'
               check (status in ('Pending','Snoozed','Completed','Cancelled')),
  repeat       text not null default 'None'
               check (repeat in ('None','Daily','Weekly','Monthly','Custom')),
  channels     text[] not null default '{}',  -- 'In-app','Email','WhatsApp','Calendar'
  assigned_to  uuid references public.profiles (id) on delete set null,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- follow_up_actions — discrete logged follow-up steps (polymorphic)
-- -----------------------------------------------------------------------------
create table if not exists public.follow_up_actions (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null,
  entity_id    uuid not null,
  action       text,
  outcome      text,
  action_date  date,
  next_date    date,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- communication_logs — timeline of contact for any entity
-- -----------------------------------------------------------------------------
create table if not exists public.communication_logs (
  id             uuid primary key default gen_random_uuid(),
  entity_type    text not null,
  entity_id      uuid not null,
  comm_type      text not null
                 check (comm_type in ('Phone call','WhatsApp','Email','Letter',
                                      'In-person','Portal update','Hearing','Site visit')),
  occurred_at    timestamptz not null default now(),
  contact_person text,
  summary        text,
  outcome        text,
  next_action    text,
  attachment     text,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- escalation_logs — RTI (PIO→FAA→Commission) / complaint (AE→…→Commissioner)
-- -----------------------------------------------------------------------------
create table if not exists public.escalation_logs (
  id                uuid primary key default gen_random_uuid(),
  entity_type       text not null,
  entity_id         uuid not null,
  from_officer      text,
  to_officer        text,
  from_level        text,
  to_level          text,
  reason            text,
  escalated_on      date,
  draft_generated   boolean not null default false,
  status            text not null default 'Open',
  response_received text,
  notes             text,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- attachments — polymorphic file metadata. OCR-ready (ocr_text placeholder).
-- Actual file bytes live in Supabase Storage (wired in a later slice).
-- -----------------------------------------------------------------------------
create table if not exists public.attachments (
  id                  uuid primary key default gen_random_uuid(),
  entity_type         text not null,
  entity_id           uuid not null,
  file_name           text,
  file_type           text,
  storage_path        text,
  description         text,
  tags                text[] not null default '{}',
  source_page         text,
  ocr_text            text,
  verification_status text not null default 'PENDING',
  uploaded_by         uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- ai_drafts — saved AI outputs. NEVER auto-filed; always editable / "review".
-- -----------------------------------------------------------------------------
create table if not exists public.ai_drafts (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text,
  entity_id    uuid,
  kind         text not null,  -- rti_application | first_appeal | second_appeal | reminder | complaint | followup | reply_analysis
  provider     text,
  model        text,
  language     text,
  prompt       text,
  content      text,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- templates — reusable RTI / appeal / complaint / follow-up templates.
-- `variables` is jsonb (array of {name,label}) instead of a child table — simpler.
-- -----------------------------------------------------------------------------
create table if not exists public.templates (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  kind              text,        -- rti_application | first_appeal | second_appeal | complaint | followup | escalation
  category          text,
  department        text,
  legal_tone        text check (legal_tone in ('Simple','Strong','Formal','Investigative')),
  language          text check (language in ('English','Kannada','Bilingual')),
  body              text,
  default_questions text[] not null default '{}',
  variables         jsonb not null default '[]',
  version           integer not null default 1,
  active            boolean not null default true,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- verification_logs — dedicated contact/officer/ward verification history
-- -----------------------------------------------------------------------------
create table if not exists public.verification_logs (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null,  -- 'contact' | 'officer' | 'ward'
  entity_id    uuid not null,
  status       text,
  note         text,
  verified_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- contacts → officer accountability columns (extend in place; no data fork)
-- -----------------------------------------------------------------------------
alter table public.contacts add column if not exists role_level text;
alter table public.contacts add column if not exists reporting_officer_id uuid references public.contacts (id) on delete set null;
alter table public.contacts add column if not exists charge_type text;
alter table public.contacts add column if not exists current_posting_start date;
alter table public.contacts add column if not exists current_posting_end date;
alter table public.contacts add column if not exists transfer_status text;
alter table public.contacts add column if not exists public_visible boolean not null default true;

-- -----------------------------------------------------------------------------
-- complaints → Phase 2 columns (nullable; enum CHECK widening lands with the
-- complaints slice so constants + UI change together). No data fork.
-- -----------------------------------------------------------------------------
alter table public.complaints add column if not exists internal_ref text;
alter table public.complaints add column if not exists description text;
alter table public.complaints add column if not exists location text;
alter table public.complaints add column if not exists latitude double precision;
alter table public.complaints add column if not exists longitude double precision;
alter table public.complaints add column if not exists landmark text;
alter table public.complaints add column if not exists complaint_mode text;
alter table public.complaints add column if not exists complaint_filed_to text;
alter table public.complaints add column if not exists responsible_department text;
alter table public.complaints add column if not exists priority text default 'Medium';
alter table public.complaints add column if not exists public_impact text;
alter table public.complaints add column if not exists escalation_level text;
alter table public.complaints add column if not exists acknowledgment_date date;
alter table public.complaints add column if not exists expected_resolution_date date;
alter table public.complaints add column if not exists resolution_summary text;
alter table public.complaints add column if not exists citizen_satisfaction text;
alter table public.complaints add column if not exists created_by uuid references public.profiles (id) on delete set null;
alter table public.complaints add column if not exists updated_by uuid references public.profiles (id) on delete set null;

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
create index if not exists idx_rti_status        on public.rti_applications (status);
create index if not exists idx_rti_priority      on public.rti_applications (priority);
create index if not exists idx_rti_corp          on public.rti_applications (corporation_id);
create index if not exists idx_rti_ward          on public.rti_applications (ward_id);
create index if not exists idx_rti_normal_due    on public.rti_applications (normal_due);
create index if not exists idx_rti_updated       on public.rti_applications (updated_at desc);
create index if not exists idx_first_appeal_rti  on public.rti_first_appeals (rti_id);
create index if not exists idx_second_appeal_rti on public.rti_second_appeals (rti_id);
create index if not exists idx_transfers_officer on public.officer_transfers (officer_id);
create index if not exists idx_reminders_due     on public.reminders (due_date);
create index if not exists idx_reminders_entity  on public.reminders (entity_type, entity_id);
create index if not exists idx_comm_entity       on public.communication_logs (entity_type, entity_id);
create index if not exists idx_escal_entity      on public.escalation_logs (entity_type, entity_id);
create index if not exists idx_attach_entity     on public.attachments (entity_type, entity_id);
create index if not exists idx_aidrafts_entity   on public.ai_drafts (entity_type, entity_id);
create index if not exists idx_followups_entity  on public.follow_up_actions (entity_type, entity_id);
create index if not exists idx_templates_kind    on public.templates (kind);
create index if not exists idx_contacts_reporting on public.contacts (reporting_officer_id);

-- -----------------------------------------------------------------------------
-- updated_at triggers (reuse public.set_updated_at from 0001)
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['rti_applications','rti_first_appeals','rti_second_appeals',
                           'reminders','templates'] loop
    execute format('drop trigger if exists trg_updated_at on public.%I', t);
    execute format('create trigger trg_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Row Level Security
--   Core RTI records (applications + appeals) are PUBLIC-read for civic
--   transparency, like the Phase 1 wards/contacts/complaints tables; internal
--   notes are hidden in the UI by role. Genuinely internal/operational tables
--   (reminders, comms, escalations, AI drafts, attachments, hearings,
--   follow-ups) are AUTHENTICATED-read (any signed-in role).
--   Writes everywhere: can_write() insert, can_verify() update, is_admin() delete.
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  -- AUTH-read tables (internal / operational)
  foreach t in array array['hearings','reminders','follow_up_actions','communication_logs',
                           'escalation_logs','ai_drafts','attachments'] loop
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

  -- PUBLIC-read tables (civic transparency)
  foreach t in array array['rti_applications','rti_first_appeals','rti_second_appeals',
                           'templates','officer_transfers','verification_logs'] loop
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
end $$;

-- app_settings: public-read, admin-only writes (deadline rules are config).
alter table public.app_settings enable row level security;
drop policy if exists "app_settings_read" on public.app_settings;
create policy "app_settings_read" on public.app_settings for select using (true);
drop policy if exists "app_settings_write" on public.app_settings;
create policy "app_settings_write" on public.app_settings for insert with check (public.is_admin());
drop policy if exists "app_settings_update" on public.app_settings;
create policy "app_settings_update" on public.app_settings for update using (public.is_admin()) with check (public.is_admin());
