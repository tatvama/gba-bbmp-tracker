-- =============================================================================
-- 0009_letter_drafts — editable Kannada/bilingual forensic letter drafts.
-- Drafts are review-only and never auto-filed. Idempotent. RLS loop mirrors 0008.
-- Run with: npm run db:migrate
-- =============================================================================

create table if not exists public.letter_drafts (
  id uuid primary key default gen_random_uuid(),
  job_number text not null,
  complaint_id uuid references public.complaints (id) on delete set null,
  variant text not null,                 -- bill_stop | lokayukta | rti | bilingual_summary
  language text not null default 'Kannada',
  signatory_key text not null default 'raghav_gowda',
  content text,                          -- final reviewed letter (post safe-language + lint)
  skeleton jsonb,                        -- LetterSkeleton (drives DOCX)
  payments jsonb, quantities jsonb,
  evidence_index jsonb, summary_box jsonb,
  risk_score integer, band text,
  ai_used boolean not null default false,
  lint_ok boolean not null default false,
  file_name text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_letter_drafts_job on public.letter_drafts (job_number);

drop trigger if exists trg_letter_drafts_updated on public.letter_drafts;
create trigger trg_letter_drafts_updated before update on public.letter_drafts
  for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['letter_drafts'] loop
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
