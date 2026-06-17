-- =============================================================================
-- 0011_finding_review — per-job triage of audit findings (accept / dismiss).
-- Lets a verifier suppress a false-positive finding (e.g. an OCR misread) so it
-- no longer inflates the risk score or ships as a ground in the drafted letter.
-- Keyed by (job_number, finding_code) so it survives audit re-runs.
-- Idempotent. RLS loop mirrors 0008. Run with: npm run db:migrate
-- =============================================================================

create table if not exists public.finding_review (
  id uuid primary key default gen_random_uuid(),
  job_number text not null,
  finding_code text not null,
  status text not null default 'dismissed', -- dismissed | accepted
  reason text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_number, finding_code)
);
create index if not exists idx_finding_review_job on public.finding_review (job_number);

drop trigger if exists trg_finding_review_updated on public.finding_review;
create trigger trg_finding_review_updated before update on public.finding_review
  for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['finding_review'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select using (public.can_write())', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format('create policy %I_write on public.%I for insert with check (public.can_write())', t, t);
    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format('create policy %I_update on public.%I for update using (public.can_write())', t, t);
    execute format('drop policy if exists %I_delete on public.%I', t, t);
    execute format('create policy %I_delete on public.%I for delete using (public.is_admin())', t, t);
  end loop;
end $$;
