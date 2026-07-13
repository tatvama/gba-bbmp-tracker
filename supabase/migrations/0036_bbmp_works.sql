-- =============================================================================
-- 0036_bbmp_works — general-purpose BBMP work-registry search + per-fact
--   source citations.
--
--   Distinct from job_cases (a forensic case-workflow record owned by the
--   ZIP-import pipeline): a bbmp_work is a work-FACTS record (tender/
--   financial/progress/officer-hierarchy) that can exist whether or not a
--   forensic case was ever opened for that job. job_case_id is an OPTIONAL
--   enrichment link, not a hard dependency — a work may be known only via a
--   live-portal fetch or an admin manual citation, with no job_cases row at
--   all.
--
--   work_sources is one-to-many per work: each row is a single citation
--   (source name/URL/document/reference/page/accessed-date) recording what
--   one source claimed. field_snapshot captures the actual values that
--   source asserted, which is what makes "Conflicting Information" detection
--   possible — without recording per-source claims, contradiction between
--   sources can't be detected, only inferred. verification_status/
--   official_source_count on bbmp_works are denormalized and recomputed by
--   app code (lib/bbmp-works/verification.ts) after every work_sources
--   insert — not a DB trigger, to keep the conflict-detection logic (which
--   needs normalization helpers) in TypeScript rather than plpgsql.
--
--   RLS mirrors the existing civic-transparency pattern (public read,
--   can_write() to insert/update, is_admin() to delete) already used by
--   job_cases/contacts/wards — see 0001_init.sql, 0016_job_import.sql.
--
--   bbmp_works_fuzzy_search is a pg_trgm-backed RPC: the supabase-js client
--   can't express `order by similarity(col, $1) desc` directly, so ward/work/
--   contractor/engineer/location "fuzzy" search tiers call this function
--   instead of a plain .select(). p_column is restricted to a fixed allow-
--   list (never taken from raw user input) even though format(%I) already
--   quotes it safely.
--
--   Idempotent (CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
--   Run with: npm run db:migrate
-- =============================================================================

create extension if not exists pg_trgm;

create table if not exists public.bbmp_works (
  id                              uuid primary key default gen_random_uuid(),
  job_number                      text,
  work_number                     text,
  project_id                      text,
  work_name                       text,
  work_description                text,
  work_category                   text,
  work_type                       text,
  ward_number                     text,
  ward_name                       text,
  zone                            text,
  division_name                   text,
  sub_division_name               text,
  department_name                 text,
  scheme_name                     text,
  grant_type                      text,
  budget_head                     text,
  financial_year                  text,
  estimate_amount                 numeric,
  sanctioned_amount               numeric,
  tender_amount                   numeric,
  tender_number                   text,
  tender_date                     date,
  tender_status                   text,
  work_order_number               text,
  work_order_date                 date,
  administrative_approval_number  text,
  technical_sanction_number       text,
  start_date                      date,
  expected_completion_date        date,
  actual_completion_date          date,
  progress_percentage             numeric,
  physical_progress               text,
  paid_amount                     numeric,
  engineer_name                   text,
  engineer_phone                  text,
  engineer_email                  text,
  assistant_engineer              text,
  assistant_executive_engineer    text,
  executive_engineer              text,
  superintending_engineer         text,
  chief_engineer                  text,
  contractor_name                 text,
  contractor_address              text,
  contractor_phone                text,
  contractor_email                text,
  contractor_registration_number  text,
  location_description            text,
  road_name                       text,
  layout_name                     text,
  latitude                        double precision,
  longitude                       double precision,
  work_status                     text,
  verification_status             text not null default 'Unverified',
  official_source_count           integer not null default 0,
  latest_update                   text,
  remarks                         text,
  job_case_id                     uuid references public.job_cases (id) on delete set null,
  created_by                      uuid references public.profiles (id) on delete set null,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  constraint bbmp_works_verification_status_check
    check (verification_status in ('Verified','Partially Verified','Unverified','Conflicting Information')),
  constraint bbmp_works_progress_pct_check
    check (progress_percentage is null or progress_percentage between 0 and 100)
);

create unique index if not exists uq_bbmp_works_job_number on public.bbmp_works (job_number) where job_number is not null;
create index if not exists idx_bbmp_works_work_number on public.bbmp_works (work_number);
create index if not exists idx_bbmp_works_tender_number on public.bbmp_works (tender_number);
create index if not exists idx_bbmp_works_work_order_number on public.bbmp_works (work_order_number);
create index if not exists idx_bbmp_works_ward_number on public.bbmp_works (ward_number);
create index if not exists idx_bbmp_works_division on public.bbmp_works (division_name);
create index if not exists idx_bbmp_works_sub_division on public.bbmp_works (sub_division_name);
create index if not exists idx_bbmp_works_zone on public.bbmp_works (zone);
create index if not exists idx_bbmp_works_job_case on public.bbmp_works (job_case_id);
create index if not exists idx_bbmp_works_created on public.bbmp_works (created_at desc);
create index if not exists idx_bbmp_works_ward_name_trgm on public.bbmp_works using gin (ward_name gin_trgm_ops);
create index if not exists idx_bbmp_works_work_name_trgm on public.bbmp_works using gin (work_name gin_trgm_ops);
create index if not exists idx_bbmp_works_location_trgm on public.bbmp_works using gin (location_description gin_trgm_ops);
create index if not exists idx_bbmp_works_contractor_trgm on public.bbmp_works using gin (contractor_name gin_trgm_ops);
create index if not exists idx_bbmp_works_engineer_trgm on public.bbmp_works using gin (engineer_name gin_trgm_ops);

create table if not exists public.work_sources (
  id                uuid primary key default gen_random_uuid(),
  work_id           uuid not null references public.bbmp_works (id) on delete cascade,
  source_id         text not null,        -- SourceId enum, lib/sources/types.ts
  source_name       text not null,        -- display label, e.g. "BBMP IFMS"
  source_url        text,
  document_name     text,
  reference_number  text,
  page_number       integer,
  field_snapshot    jsonb,                -- {field: value, ...} this source asserted
  is_official       boolean not null default true,
  accessed_date     date not null default current_date,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now()
);
create index if not exists idx_work_sources_work on public.work_sources (work_id);
create index if not exists idx_work_sources_source_id on public.work_sources (source_id);

do $$
begin
  execute 'drop trigger if exists trg_bbmp_works_updated on public.bbmp_works';
  execute 'create trigger trg_bbmp_works_updated before update on public.bbmp_works for each row execute function public.set_updated_at()';
end $$;

-- Row Level Security — public read (civic transparency, matches job_cases/contacts);
-- writes gated by can_write(), deletes admin-only. ---------------------------
do $$
declare t text;
begin
  foreach t in array array['bbmp_works','work_sources'] loop
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

-- Fuzzy-match RPC for ward/work/contractor/engineer/location text tiers. ------
create or replace function public.bbmp_works_fuzzy_search(
  p_column text,
  p_query text,
  p_threshold real default 0.3,
  p_limit int default 25
)
returns setof public.bbmp_works
language plpgsql
stable
as $$
begin
  if p_column not in ('ward_name','work_name','contractor_name','engineer_name','location_description') then
    raise exception 'bbmp_works_fuzzy_search: column % not allowed', p_column;
  end if;
  return query execute format(
    'select * from public.bbmp_works where %I is not null and similarity(%I, $1) > $2 order by similarity(%I, $1) desc limit $3',
    p_column, p_column, p_column
  ) using p_query, p_threshold, p_limit;
end;
$$;

notify pgrst, 'reload schema';
