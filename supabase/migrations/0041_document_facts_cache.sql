-- -----------------------------------------------------------------------------
-- 0041 — Per-document cache for the Case Intelligence Engine's unconditional
-- reference-fact extraction (AA/TS/KW-4 agreement/work-order/tender/MDP/
-- royalty/insurance — lib/ai/extractors/document-facts.ts).
--
-- Keyed by a hash of the document's OWN OCR text, not by complaint/case: when a
-- NEW document is added to a case, only that document has no cached facts (or a
-- hash mismatch) and gets (re-)processed; every already-processed, unchanged
-- document is skipped. If a document's OCR text later changes (e.g. OCR
-- completes after initially being empty), the hash mismatch triggers a
-- re-extraction for that document only.
-- -----------------------------------------------------------------------------

alter table public.complaint_documents add column if not exists document_facts jsonb;
alter table public.complaint_documents add column if not exists document_facts_hash text;
alter table public.complaint_documents add column if not exists document_facts_extracted_at timestamptz;

alter table public.job_documents add column if not exists document_facts jsonb;
alter table public.job_documents add column if not exists document_facts_hash text;
alter table public.job_documents add column if not exists document_facts_extracted_at timestamptz;

notify pgrst, 'reload schema';
