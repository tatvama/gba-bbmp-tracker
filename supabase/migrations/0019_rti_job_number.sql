-- -----------------------------------------------------------------------------
-- 0019_rti_job_number — link an RTI to a BBMP/GBA job code (ddd-yy-nnnnnn).
--   Mirrors complaints.job_number (0005) so an RTI carrying the job number can
--   be joined to the Complaint + forensic job_case/job_audit that share it.
--   The shared job_number string IS the link — no join table.
--   Nullable, no backfill (existing rows stay NULL). RLS unaffected; reads use
--   SELECT * (RTI_SELECT) so the column flows through once the TS type declares it.
--   Idempotent. Run with: npm run db:migrate
-- -----------------------------------------------------------------------------

alter table public.rti_applications add column if not exists job_number text;

create index if not exists idx_rti_job_number
  on public.rti_applications (job_number) where job_number is not null;

notify pgrst, 'reload schema';
