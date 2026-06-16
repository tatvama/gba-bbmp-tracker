-- =============================================================================
-- 0008_job_audit — Job-number forensic audit aggregate + structured AI-extracted
-- inputs. Idempotent (CREATE IF NOT EXISTS). RLS loop mirrors 0007.
-- Run with: npm run db:migrate
-- =============================================================================

create table if not exists public.job_audits (
  id uuid primary key default gen_random_uuid(),
  job_number text not null,
  report jsonb,                          -- full JobAuditReport
  risk_score integer not null default 0, -- additive SEV+EVD+addon, clamped 0..100
  risk_band text,                        -- low | procedural | serious | bill_stop
  total_exposure numeric,
  finding_count integer not null default 0,
  red_flag_count integer not null default 0,
  doc_count integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_job_audits_job on public.job_audits (job_number);
create index if not exists idx_job_audits_created on public.job_audits (created_at desc);

create table if not exists public.job_timeline_dates (
  id uuid primary key default gen_random_uuid(),
  job_number text not null,
  document_id uuid references public.complaint_documents(id) on delete cascade,
  event text not null, event_date date, raw text, confidence text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_jtd_job on public.job_timeline_dates (job_number);

create table if not exists public.job_eligibility (
  id uuid primary key default gen_random_uuid(),
  job_number text not null,
  document_id uuid references public.complaint_documents(id) on delete cascade,
  req_key text not null, label text, operator text, required text, actual text,
  critical boolean default true, status text,   -- pass | fail | unknown
  created_at timestamptz not null default now()
);
create index if not exists idx_jelig_job on public.job_eligibility (job_number);

create table if not exists public.job_insurance (
  id uuid primary key default gen_random_uuid(),
  job_number text not null,
  document_id uuid references public.complaint_documents(id) on delete cascade,
  policy_type text, start_date date, end_date date, sum_insured numeric,
  premium_receipt boolean, authority_named boolean,
  created_at timestamptz not null default now()
);
create index if not exists idx_jins_job on public.job_insurance (job_number);

create table if not exists public.job_running_bills (
  id uuid primary key default gen_random_uuid(),
  job_number text not null,
  document_id uuid references public.complaint_documents(id) on delete cascade,
  bill_no text, bill_date date, item_code text,
  previous_measurement numeric, this_bill numeric, total_upto_date numeric,
  created_at timestamptz not null default now()
);
create index if not exists idx_jrb_job on public.job_running_bills (job_number);

drop trigger if exists trg_job_audits_updated on public.job_audits;
create trigger trg_job_audits_updated before update on public.job_audits
  for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['job_audits','job_timeline_dates','job_eligibility','job_insurance','job_running_bills'] loop
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

-- Tunable rules row (defaults live in lib/constants.ts; this row is convenience only).
insert into public.app_settings (key, value)
  values ('job_audit_rules', '{}'::jsonb)
  on conflict (key) do nothing;
