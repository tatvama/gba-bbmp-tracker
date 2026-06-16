-- =============================================================================
-- 0007_bill_audit — Forensic bill-audit engine
-- Target: Supabase Postgres. Run with: npm run db:migrate
-- Idempotent: CREATE / ADD IF NOT EXISTS.
--
-- Adds: bill_audits (structured bill + deterministic/AI findings + score) and
-- sr_rates (Schedule of Rates / approved tender rates) for rate-abuse checks.
-- Statistical + material-balance checks reuse these + existing data (no new cols).
-- =============================================================================

-- bill_audits — one audited bill (structured extraction + findings + score) -----
create table if not exists public.bill_audits (
  id              uuid primary key default gen_random_uuid(),
  complaint_id    uuid references public.complaints (id) on delete cascade,
  document_id     uuid references public.complaint_documents (id) on delete set null,
  source          text not null default 'document',   -- document | manual
  extracted       jsonb,                                -- StructuredBill
  findings        jsonb,                                -- BillFinding[]
  grand_total     numeric,                              -- denormalised for analytics
  red_flag_count  integer not null default 0,
  score           integer not null default 0,
  confidence      text,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_bill_audits_complaint on public.bill_audits (complaint_id);
create index if not exists idx_bill_audits_total on public.bill_audits (grand_total) where grand_total is not null;

-- sr_rates — Schedule of Rates / approved tender (BOQ) rates --------------------
create table if not exists public.sr_rates (
  id           uuid primary key default gen_random_uuid(),
  sr_code      text,
  description  text not null,
  unit         text,
  rate         numeric not null,
  sr_year      text,
  region       text,
  source       text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_sr_rates_code on public.sr_rates (sr_code) where sr_code is not null;

-- updated_at trigger for bill_audits (reuses set_updated_at from 0001).
drop trigger if exists trg_bill_audits_updated on public.bill_audits;
create trigger trg_bill_audits_updated before update on public.bill_audits
  for each row execute function public.set_updated_at();

-- RLS: public read; writers insert/update; admin delete (mirrors other tables).
alter table public.bill_audits enable row level security;
alter table public.sr_rates enable row level security;
do $$
declare t text;
begin
  foreach t in array array['bill_audits','sr_rates'] loop
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
