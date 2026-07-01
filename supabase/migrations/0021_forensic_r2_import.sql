-- -----------------------------------------------------------------------------
-- 0021_forensic_r2_import — forensic ZIP import moves to R2-only storage.
--   The raw uploaded ZIP is no longer staged in R2 at all (it's extracted into
--   a local temp directory on the app server instead, transient, never
--   persisted); `forensic_import_batches.storage_path` therefore no longer
--   holds an R2 URL — it holds a LOCAL FILESYSTEM path — renamed to
--   `extract_dir` so nobody mistakes it for an object-storage key/URL, which
--   is what "storage_path" means everywhere else in this schema.
--
--   Every per-job file extracted from the ZIP now lands permanently in R2
--   (never Supabase Storage) — job_documents/complaint_documents rows for
--   these files carry storage_bucket = 'r2' (a non-null sentinel, so existing
--   truthy `storage_bucket && storage_path` guards elsewhere keep working
--   unmodified) and storage_path holds a BARE R2 OBJECT KEY (never a full
--   https:// URL), of the form forensic/<job-number>/<relative_path>.
--
--   Out of scope, unaffected: IFMS-portal-downloaded job_documents rows and
--   ordinary complaint-document uploads keep using Supabase Storage with
--   their real bucket name — a mixed-backend table, same pattern RTI already
--   runs safely in production.
--
--   Idempotent (ADD COLUMN IF NOT EXISTS). Run with: npm run db:migrate
-- -----------------------------------------------------------------------------

alter table public.forensic_import_batches rename column storage_path to extract_dir;

comment on column public.forensic_import_batches.extract_dir is
  'Local filesystem path (this container instance only — not object storage) that the uploaded ZIP was extracted into at analyze-time. Read by commitForensicImportAction; deleted (best-effort) once all selected jobs have been processed, success or failure. If the container restarts between analyze and commit this path is gone — commit fails with a clear "please re-upload" error rather than crashing.';

alter table public.forensic_import_batches add column if not exists commit_summary jsonb;

comment on column public.forensic_import_batches.commit_summary is
  'Import summary written once at the end of commitForensicImportAction: {totalFiles, uploaded, failed, skipped, durationMs}. Null until committed.';

alter table public.job_documents add column if not exists relative_path text;

comment on column public.job_documents.relative_path is
  'Path within the job''s R2 folder (storage_path = forensic/<job-number>/<relative_path>), preserving the forensic-audit-skill''s data/letters/work grouping. Only populated for storage_bucket = ''r2'' rows; null for legacy IFMS-portal rows.';

alter table public.complaint_documents add column if not exists relative_path text;

comment on column public.complaint_documents.relative_path is
  'Same purpose as job_documents.relative_path. Only populated for the forensic-ZIP-imported letter-attachment rows (storage_bucket = ''r2''); null for all other complaint_documents rows (ordinary uploads, RTI — unaffected, out of scope).';

notify pgrst, 'reload schema';
