-- =============================================================================
-- 0012_audit_intake — structured intake for the Audit & Draft wizard (180-Q).
-- Stores the wizard's reproducible/editable state: ticked suspicion codes, per-
-- code notes, the chosen recipient + copy chain, the sender, flag tallies, loss
-- lines and the persisted letter skeleton (so the DOCX route can rebuild it).
-- ai_drafts holds only the final text; this table holds the structure behind it.
-- Idempotent. RLS loop mirrors 0011. Run with: npm run db:migrate
-- =============================================================================

create table if not exists public.audit_intakes (
  id uuid primary key default gen_random_uuid(),
  output_type text not null,                       -- rti | complaint
  entity_type text,                                -- rti | complaint (set after the case is created)
  entity_id uuid,
  job_number text,
  ward_id uuid references public.wards (id) on delete set null,
  road_name text,
  contractor text,
  language text not null default 'Kannada',
  scope text not null default 'smart',             -- smart | all
  selected_codes text[] not null default '{}',
  notes jsonb not null default '{}'::jsonb,         -- { "Q18": "note", ... }
  recipient jsonb,                                  -- { name, designation, office, address }
  cc_chain jsonb,                                   -- [ { name, designation, office, address } ]
  sender jsonb,                                     -- { signatoryKey } | { name, address, mobile }
  flag_counts jsonb,                                -- { red, orange, amber }
  loss_lines jsonb,                                 -- LossLineInput[]
  loss_total numeric,
  skeleton jsonb,                                   -- persisted LetterSkeleton (for the DOCX route)
  content text,                                     -- final draft text
  ai_draft_id uuid references public.ai_drafts (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_audit_intakes_job on public.audit_intakes (job_number);
create index if not exists idx_audit_intakes_entity on public.audit_intakes (entity_type, entity_id);

drop trigger if exists trg_audit_intakes_updated on public.audit_intakes;
create trigger trg_audit_intakes_updated before update on public.audit_intakes
  for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['audit_intakes'] loop
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
