-- -----------------------------------------------------------------------------
-- 0029_document_page_range — multi-complaint split from one uploaded PDF.
--
--   When a single uploaded PDF holds several distinct complaint letters, the
--   intake pipeline detects the boundaries and creates ONE complaint per letter.
--   Each complaint's attached document is the carved sub-PDF for its pages; these
--   columns record which pages of the ORIGINAL upload it came from and preserve a
--   pointer to that original combined file, so the full source is never lost:
--
--     source_page_start / source_page_end  — 1-indexed inclusive page range in
--                                             the original combined PDF
--     source_original_path                 — R2 key of the complete uploaded PDF
--     source_original_name                 — its display file name
--
--   All null for ordinary single-file uploads (unchanged behaviour). Idempotent —
--   scripts/migrate.ts re-applies every file; add-column-if-not-exists is safe.
-- -----------------------------------------------------------------------------

alter table public.complaint_documents add column if not exists source_page_start integer;
alter table public.complaint_documents add column if not exists source_page_end integer;
alter table public.complaint_documents add column if not exists source_original_path text;
alter table public.complaint_documents add column if not exists source_original_name text;

comment on column public.complaint_documents.source_page_start is
  'For a document carved from a multi-complaint PDF: 1-indexed first page in the original combined upload (null for normal uploads).';
comment on column public.complaint_documents.source_original_path is
  'R2 key of the complete original PDF this document was split from — the full source is preserved and viewable (null for normal uploads).';

notify pgrst, 'reload schema';
