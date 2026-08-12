-- Recipient Selection + Office Copy (Document Distribution context, Tier 1).
--
-- Additive only: a recipient/copy-to snapshot plus document-variant lineage on
-- the existing complaint_documents table. No new tables — the jsonb snapshot
-- mirrors the audit_intakes.recipient/cc_chain precedent (0012), and roles live
-- in a code registry (lib/complaints/recipient-roles.ts), not in the schema.
--
-- doc_variant is validated in the app against the DOCUMENT_VARIANTS registry
-- (lib/distribution/document-variants.ts) rather than a DB CHECK, so future
-- variants (signed / dispatch / archived / digitally_signed) need no migration.

alter table public.complaint_documents
  add column if not exists recipients jsonb,          -- selected roles + resolved officers, at file time
  add column if not exists copy_to jsonb,             -- LetterRecipient[] actually rendered into the Copy To
  add column if not exists doc_variant text not null default 'recipient',
  add column if not exists parent_document_id uuid references public.complaint_documents (id) on delete cascade;

-- Fetch a filed letter's variants (e.g. its office copy) and exclude office
-- copies from the top-level document list. Partial: only linked rows.
create index if not exists idx_complaint_documents_parent
  on public.complaint_documents (parent_document_id)
  where parent_document_id is not null;
