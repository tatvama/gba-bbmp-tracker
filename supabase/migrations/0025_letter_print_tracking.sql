-- -----------------------------------------------------------------------------
-- 0025_letter_print_tracking — the physical-letter leg of the complaint cycle.
--
--   A forensic-ZIP import attaches a drafted complaint letter; before anything
--   else can happen the letter must be PRINTED and then SUBMITTED (by hand /
--   post / RPAD — that part is already recorded by fileComplaint, which sets
--   complaints.status = 'Filed' + complaint_mode + reference). This migration
--   adds the missing PRINT state so a "Print queue" page can list every letter
--   waiting to be printed, and each print is stamped with when + by whom:
--
--     print_status: 'none'    — not in the print pipeline (old/manual drafts)
--                   'pending' — waiting in the print queue  ← imports land here
--                   'printed' — printed_at/printed_by stamped; next: submit it
--
--   NOTE ON RE-RUNS: scripts/migrate.ts re-applies every file — everything
--   here must be idempotent. The backfill only promotes never-touched
--   ('none', never printed) bill_stop letters of still-Draft complaints, so
--   re-running never resurrects rows a user has already moved on.
-- -----------------------------------------------------------------------------

alter table public.letter_drafts add column if not exists print_status text not null default 'none';

do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_schema = 'public' and table_name = 'letter_drafts' and constraint_name = 'letter_drafts_print_status_check'
  ) then
    alter table public.letter_drafts
      add constraint letter_drafts_print_status_check
      check (print_status in ('none', 'pending', 'printed'));
  end if;
end $$;

alter table public.letter_drafts add column if not exists printed_at timestamptz;
alter table public.letter_drafts add column if not exists printed_by uuid references public.profiles (id) on delete set null;

create index if not exists idx_letter_drafts_print_pending
  on public.letter_drafts (print_status, created_at)
  where print_status in ('pending', 'printed');

comment on column public.letter_drafts.print_status is
  'Print pipeline state: none (not queued), pending (in the Print-queue page), printed (stamped printed_at/printed_by; submission is then recorded by fileComplaint on the complaint itself).';

-- Backfill: imported (bill_stop) letters whose complaint is still Draft and
-- that were never printed enter the queue. Safe on re-run (see header).
update public.letter_drafts ld
set print_status = 'pending'
from public.complaints c
where ld.complaint_id = c.id
  and c.status = 'Draft'
  and ld.variant = 'bill_stop'
  and ld.print_status = 'none'
  and ld.printed_at is null;

notify pgrst, 'reload schema';
