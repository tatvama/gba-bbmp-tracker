-- Contact module → BBMP master official directory (Phase 1: jurisdiction + AI drafting).
--
-- Additive only. Existing contacts create/update/list/search and every FK into
-- contacts (complaints, rti, transfers, communications) are untouched:
--   * the write path (lib/actions/contacts.ts toRow) is an explicit column
--     allowlist, so new columns are ignored by existing inserts;
--   * reads use select("*") / CONTACT_SELECT, so new columns flow through
--     automatically and are simply null on existing rows.
--
-- The one-to-many contact_jurisdictions table gives the app its first real
-- ward -> officer link (today a ward reaches an officer only transitively via
-- eng_subdivision_id). One officer contact maps to many wards without
-- duplicating the officer (the ARO directory: 64 officers over 198 wards).

-- ── contacts: additive columns for identity, classification, workflow, import ──
alter table public.contacts
  add column if not exists official_title text,            -- Sri / Smt / Mr / Mrs / Ms / Dr / Er
  add column if not exists office_name text,               -- e.g. "BBMP ARO Office, K.R. Puram"
  add column if not exists letter_salutation text,         -- e.g. "Respected Sir / Madam"
  add column if not exists designation_category text,      -- Revenue / Engineering / Health / TVCC / Legal / ...
  add column if not exists office_type text,               -- ARO Office / Ward Office / Zone Office / Head Office / ...
  add column if not exists zone text,                      -- BBMP administrative zone (free text; not the GBA corporation)
  add column if not exists employee_code text,
  add column if not exists officer_status text not null default 'Active'
    check (officer_status in ('Active','Transferred','Retired','Inactive')),
  add column if not exists can_receive_complaint    boolean not null default true,
  add column if not exists can_receive_rti           boolean not null default true,
  add column if not exists can_receive_appeal        boolean not null default true,
  add column if not exists can_receive_legal_notice  boolean not null default true,
  add column if not exists can_receive_tvcc_notice   boolean not null default false,
  add column if not exists imported_from text,             -- source document label
  add column if not exists imported_at timestamptz;

-- ── contact_jurisdictions: one contact → many wards (one-to-many) ──────────────
create table if not exists public.contact_jurisdictions (
  id                  uuid primary key default gen_random_uuid(),
  contact_id          uuid not null references public.contacts (id) on delete cascade,
  -- Resolved BBMP-225 ward when the ward number matches wards.new_no; ward_no /
  -- ward_name are always the authoritative values as printed on the source.
  ward_id             uuid references public.wards (id) on delete set null,
  ward_no             integer,
  ward_name           text,
  zone                text,               -- BBMP administrative zone (free text)
  aro_office_division text,               -- the office/grouping the ward sits under (e.g. "K.R. Puram")
  jurisdiction_type   text not null default 'ward'
                      check (jurisdiction_type in ('ward','division','zone','city')),
  is_primary          boolean not null default false,
  created_at          timestamptz not null default now()
);

-- One row per (contact, ward number). Re-importing upserts rather than duplicating.
create unique index if not exists uq_contact_jur_contact_ward
  on public.contact_jurisdictions (contact_id, ward_no);
create index if not exists idx_contact_jur_contact on public.contact_jurisdictions (contact_id);
create index if not exists idx_contact_jur_ward_no on public.contact_jurisdictions (ward_no);
create index if not exists idx_contact_jur_ward_id on public.contact_jurisdictions (ward_id)
  where ward_id is not null;

-- RLS mirroring contacts: public read, role-gated writes (0001_init.sql pattern).
alter table public.contact_jurisdictions enable row level security;
drop policy if exists "contact_jurisdictions_read" on public.contact_jurisdictions;
create policy "contact_jurisdictions_read" on public.contact_jurisdictions for select using (true);
drop policy if exists "contact_jurisdictions_insert" on public.contact_jurisdictions;
create policy "contact_jurisdictions_insert" on public.contact_jurisdictions for insert with check (public.can_write());
drop policy if exists "contact_jurisdictions_update" on public.contact_jurisdictions;
create policy "contact_jurisdictions_update" on public.contact_jurisdictions for update using (public.can_write()) with check (public.can_write());
drop policy if exists "contact_jurisdictions_delete" on public.contact_jurisdictions;
create policy "contact_jurisdictions_delete" on public.contact_jurisdictions for delete using (public.can_write());
