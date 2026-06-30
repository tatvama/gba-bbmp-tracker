-- -----------------------------------------------------------------------------
-- 0017_rti_import_batches — refresh-safe multi-letter "office copy" import.
--   One row per uploaded office-copy PDF that is being split into several RTI
--   letters. Detection (render + OCR + AI letter-boundary detection) runs in the
--   background (Next `after()`), writing its result here, so the browser can
--   poll for status and re-attach after a page refresh instead of restarting.
--   Transient/working data — removed once the batch is committed or abandoned.
-- -----------------------------------------------------------------------------
create table if not exists public.rti_import_batches (
  id              uuid primary key default gen_random_uuid(),
  status          text not null default 'Processing', -- Processing | Ready | Committed | Failed
  storage_path    text not null,                       -- merged PDF in the rti-documents bucket (_imports/…)
  page_count      integer,
  letters         jsonb,                               -- AnalyzedLetter[] once detection completes
  created_case_ids jsonb,                              -- uuid[] of RTI cases created on commit
  error           text,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_rti_import_batches_creator on public.rti_import_batches (created_by);
create index if not exists idx_rti_import_batches_status  on public.rti_import_batches (status);
create index if not exists idx_rti_import_batches_created on public.rti_import_batches (created_at desc);

-- updated_at trigger (reuse public.set_updated_at from 0001)
drop trigger if exists trg_updated_at on public.rti_import_batches;
create trigger trg_updated_at before update on public.rti_import_batches
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security — staff-only working data (not civic-public, unlike the
-- RTI record itself). Reads/writes follow the standard can_write pattern; the
-- background detector updates rows via the service-role admin client (bypasses
-- RLS), so these policies cover the interactive (cookie-scoped) paths.
-- -----------------------------------------------------------------------------
alter table public.rti_import_batches enable row level security;

drop policy if exists "rti_import_batches_read" on public.rti_import_batches;
create policy "rti_import_batches_read" on public.rti_import_batches for select using (public.can_write());

drop policy if exists "rti_import_batches_insert" on public.rti_import_batches;
create policy "rti_import_batches_insert" on public.rti_import_batches for insert with check (public.can_write());

drop policy if exists "rti_import_batches_update" on public.rti_import_batches;
create policy "rti_import_batches_update" on public.rti_import_batches for update using (public.can_write()) with check (public.can_write());

drop policy if exists "rti_import_batches_delete" on public.rti_import_batches;
create policy "rti_import_batches_delete" on public.rti_import_batches for delete using (public.is_admin());
