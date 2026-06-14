-- =============================================================================
-- GBA / BBMP Ward & Engineer Platform — initial schema
-- Target: Supabase Postgres. Run with: npm run db:migrate
-- Idempotent: safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- =============================================================================

create extension if not exists pgcrypto; -- gen_random_uuid()

-- -----------------------------------------------------------------------------
-- profiles — mirrors auth.users with an app role
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text,
  email       text,
  role        text not null default 'VIEWER'
              check (role in ('ADMIN', 'EDITOR', 'VERIFIER', 'VIEWER')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- corporations — GBA 5-corporation structure (369/50/150)
-- -----------------------------------------------------------------------------
create table if not exists public.corporations (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique
                check (code in ('KENDRA', 'PURVA', 'PASHCHIMA', 'UTTARA', 'DAKSHINA')),
  name          text not null,
  name_kn       text,
  ward_count        integer not null default 0,
  division_count    integer not null default 0,
  subdivision_count integer not null default 0,
  assembly_constituencies text[] not null default '{}',
  annexure      text,
  address       text,
  phone         text,
  email         text,
  website       text,
  notes         text,
  created_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- divisions — BBMP-225 engineering divisions. corporation_id is AC-DERIVED.
-- -----------------------------------------------------------------------------
create table if not exists public.divisions (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  corporation_id  uuid references public.corporations (id) on delete set null,
  corporation_derived boolean not null default true,
  address         text,
  notes           text,
  created_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- eng_subdivisions — THE engineer's unit of responsibility (75 of them).
-- Contacts attach here; wards inherit the contact through it.
-- -----------------------------------------------------------------------------
create table if not exists public.eng_subdivisions (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  sl_no        integer,
  division_id  uuid references public.divisions (id) on delete set null,
  address      text,
  notes        text,
  created_at   timestamptz not null default now(),
  unique (name, division_id)
);

-- -----------------------------------------------------------------------------
-- wards — BBMP-225 wards (authoritative). derived_corporation_id is AC-DERIVED.
-- -----------------------------------------------------------------------------
create table if not exists public.wards (
  id                     uuid primary key default gen_random_uuid(),
  new_no                 integer not null unique,
  new_name               text not null,
  property_count         integer,
  zone                   text,
  assembly_constituency  text,
  old_subdiv             text,
  old_wards              text[] not null default '{}',
  division_id            uuid references public.divisions (id) on delete set null,
  eng_subdivision_id     uuid references public.eng_subdivisions (id) on delete set null,
  derived_corporation_id uuid references public.corporations (id) on delete set null,
  derived_normalised     boolean not null default false,
  source                 text,
  source_page            text,
  verification_status    text not null default 'PENDING'
                         check (verification_status in
                           ('VERIFIED','PENDING','NEEDS_CORRECTION','RETIRED_TRANSFERRED','UNKNOWN')),
  confidence_score       text not null default 'MEDIUM'
                         check (confidence_score in ('HIGH','MEDIUM','LOW')),
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- contacts — engineers / officers, attached at sub-division (or div/corp) level
-- -----------------------------------------------------------------------------
create table if not exists public.contacts (
  id                  uuid primary key default gen_random_uuid(),
  full_name           text not null,
  designation         text not null,
  department          text,
  corporation_id      uuid references public.corporations (id) on delete set null,
  division_id         uuid references public.divisions (id) on delete set null,
  eng_subdivision_id  uuid references public.eng_subdivisions (id) on delete set null,
  office_address      text,
  phone               text,
  whatsapp            text,
  email               text,
  office_timing       text,
  jurisdiction_notes  text,
  latitude            double precision,
  longitude           double precision,
  source              text,
  source_page         text,
  verification_status text not null default 'PENDING'
                      check (verification_status in
                        ('VERIFIED','PENDING','NEEDS_CORRECTION','RETIRED_TRANSFERRED','UNKNOWN')),
  last_verified_date  date,
  confidence_score    text not null default 'MEDIUM'
                      check (confidence_score in ('HIGH','MEDIUM','LOW')),
  public_notes        text,
  internal_notes      text,
  created_by          uuid references public.profiles (id) on delete set null,
  updated_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- complaints — complaint / RTI tracker
-- -----------------------------------------------------------------------------
create table if not exists public.complaints (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  type               text not null
                     check (type in ('road','drain','garbage','streetlight',
                       'public-works','bill','RTI','contractor','other')),
  ward_id            uuid references public.wards (id) on delete set null,
  eng_subdivision_id uuid references public.eng_subdivisions (id) on delete set null,
  contact_id         uuid references public.contacts (id) on delete set null,
  complaint_number   text,
  rti_number         text,
  date_submitted     date,
  due_date           date,
  status             text not null default 'DRAFT'
                     check (status in ('DRAFT','SUBMITTED','UNDER_REVIEW',
                       'REPLY_RECEIVED','ESCALATED','CLOSED')),
  notes              text,
  next_action_date   date,
  reminder_flag      boolean not null default false,
  attachment         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- source_documents, audit_logs, import_logs
-- -----------------------------------------------------------------------------
create table if not exists public.source_documents (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  file_name     text,
  document_type text,
  date          date,
  url           text,
  notes         text,
  created_at    timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id   text not null,
  field_name  text,
  old_value   text,
  new_value   text,
  changed_by  uuid references public.profiles (id) on delete set null,
  changed_at  timestamptz not null default now()
);

create table if not exists public.import_logs (
  id            uuid primary key default gen_random_uuid(),
  file_name     text not null,
  sheet_name    text,
  total_rows    integer not null default 0,
  imported_rows integer not null default 0,
  skipped_rows  integer not null default 0,
  error_rows    integer not null default 0,
  dry_run       boolean not null default false,
  imported_by   uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
create index if not exists idx_divisions_corp on public.divisions (corporation_id);
create index if not exists idx_subdiv_division on public.eng_subdivisions (division_id);
create index if not exists idx_wards_division on public.wards (division_id);
create index if not exists idx_wards_subdiv on public.wards (eng_subdivision_id);
create index if not exists idx_wards_corp on public.wards (derived_corporation_id);
create index if not exists idx_wards_ac on public.wards (assembly_constituency);
create index if not exists idx_contacts_subdiv on public.contacts (eng_subdivision_id);
create index if not exists idx_contacts_division on public.contacts (division_id);
create index if not exists idx_contacts_corp on public.contacts (corporation_id);
create index if not exists idx_complaints_ward on public.complaints (ward_id);
create index if not exists idx_audit_entity on public.audit_logs (entity_type, entity_id);

-- -----------------------------------------------------------------------------
-- updated_at trigger
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','wards','contacts','complaints'] loop
    execute format('drop trigger if exists trg_updated_at on public.%I', t);
    execute format('create trigger trg_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Auth: auto-create a profile when a new auth user is created
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'VIEWER')
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Role helpers (security definer to avoid RLS recursion on profiles)
-- -----------------------------------------------------------------------------
create or replace function public.user_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.can_write()
returns boolean language sql stable as $$
  select public.user_role() in ('ADMIN','EDITOR');
$$;

create or replace function public.can_verify()
returns boolean language sql stable as $$
  select public.user_role() in ('ADMIN','EDITOR','VERIFIER');
$$;

create or replace function public.is_admin()
returns boolean language sql stable as $$
  select public.user_role() = 'ADMIN';
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- Civic data is public to READ (anon + authenticated). Writes require a role.
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['corporations','divisions','eng_subdivisions','wards',
                           'contacts','complaints','source_documents'] loop
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

-- audit_logs: readable by authenticated, insert-only, immutable
alter table public.audit_logs enable row level security;
drop policy if exists "audit_read" on public.audit_logs;
create policy "audit_read" on public.audit_logs for select using (auth.uid() is not null);
drop policy if exists "audit_insert" on public.audit_logs;
create policy "audit_insert" on public.audit_logs for insert with check (auth.uid() is not null);

-- import_logs: readable + insertable by writers
alter table public.import_logs enable row level security;
drop policy if exists "import_read" on public.import_logs;
create policy "import_read" on public.import_logs for select using (auth.uid() is not null);
drop policy if exists "import_insert" on public.import_logs;
create policy "import_insert" on public.import_logs for insert with check (public.can_write());

-- profiles
alter table public.profiles enable row level security;
drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles for select using (auth.uid() is not null);
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles for update
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());
drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles for insert
  with check (auth.uid() = id or public.is_admin());
