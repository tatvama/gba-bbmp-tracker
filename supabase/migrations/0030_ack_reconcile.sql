-- -----------------------------------------------------------------------------
-- 0030_ack_reconcile — bulk acknowledgment reconciliation.
--
--   The user has 200+ complaints already in the system (created from ZIP/letter
--   imports) AND a big scanned PDF holding all the BBMP acknowledgments (proof of
--   receipt) mixed together, in no particular order, with variable page counts.
--   This feature splits that PDF into per-acknowledgment sections, matches each
--   section to the RIGHT existing complaint (by job code / BBMP complaint number
--   / subject+ward+reporter), and — after a human confirms every match — attaches
--   the carved sub-PDF to that complaint as a "Complaint acknowledgement".
--
--   ack_import_batches : one row per uploaded acknowledgment PDF (the whole job).
--                        Holds the preserved original + processing progress.
--   ack_import_items   : one row per detected acknowledgment section, with its
--                        page range, OCR/extracted identifiers, per-page thumbnail
--                        keys, the AI-proposed complaint + confidence + candidate
--                        evidence, and the human decision (confirm / reassign /
--                        skip). Persisted so a long review of 200 items survives a
--                        browser close and is fully auditable.
--
--   Access is via the admin (service-role) client behind app-level requireRole
--   checks — same pattern as import_uploads (0024) / forensic_import_batches — so
--   no row-level policies are declared here.
--
--   NOTE ON RE-RUNS: scripts/migrate.ts re-applies every file — everything here
--   must be idempotent.
-- -----------------------------------------------------------------------------

create table if not exists public.ack_import_batches (
  id                    uuid primary key default gen_random_uuid(),
  -- Preserved original (merged) PDF of all acknowledgments — R2 public URL, so
  -- the runner can re-download it and the commit step can carve page ranges.
  original_storage_path text,
  original_name         text,
  page_count            integer not null default 0,
  processed_pages       integer not null default 0,
  status                text not null default 'processing'
                        check (status in ('processing','review','committing','committed','failed')),
  stage                 text,   -- human label: Rendering / OCR / Matching / Ready …
  message               text,   -- last live ticker line
  error                 text,
  -- Per-page OCR text {"1":"…","2":"…"} kept so the review UI can re-slice text
  -- when a human merges/splits section boundaries on the page-strip (no re-OCR).
  page_ocr              jsonb not null default '{}'::jsonb,
  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  finished_at           timestamptz
);

create index if not exists idx_ack_batches_user_created
  on public.ack_import_batches (created_by, created_at desc);
create index if not exists idx_ack_batches_status
  on public.ack_import_batches (status, created_at);

create table if not exists public.ack_import_items (
  id                    uuid primary key default gen_random_uuid(),
  batch_id              uuid not null references public.ack_import_batches (id) on delete cascade,
  sort_order            integer not null default 0,
  -- 1-indexed inclusive page range in the original combined PDF.
  page_start            integer not null,
  page_end              integer not null,
  ocr_text              text,
  -- The AI extraction for this section (subject, jobNumber, referenceNumber,
  -- areaOrWard, reporterName, documentType, importantDates, …).
  extracted             jsonb not null default '{}'::jsonb,
  -- R2 keys of the per-page thumbnails for the visual page-strip.
  thumb_paths           jsonb not null default '[]'::jsonb,
  -- AI-proposed match + how confident + the ranked candidates/evidence.
  proposed_complaint_id uuid references public.complaints (id) on delete set null,
  match_confidence      text not null default 'none'
                        check (match_confidence in ('high','medium','low','none')),
  match_evidence        jsonb not null default '{}'::jsonb,
  -- The human's decision. assigned_complaint_id overrides the proposal.
  assigned_complaint_id uuid references public.complaints (id) on delete set null,
  decision              text not null default 'pending'
                        check (decision in ('pending','confirmed','skipped','committed')),
  attached_document_id  uuid references public.complaint_documents (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_ack_items_batch on public.ack_import_items (batch_id, sort_order);
create index if not exists idx_ack_items_decision on public.ack_import_items (batch_id, decision);

drop trigger if exists set_ack_batches_updated on public.ack_import_batches;
create trigger set_ack_batches_updated before update on public.ack_import_batches
  for each row execute function public.set_updated_at();

drop trigger if exists set_ack_items_updated on public.ack_import_items;
create trigger set_ack_items_updated before update on public.ack_import_items
  for each row execute function public.set_updated_at();

comment on table public.ack_import_batches is
  'Bulk acknowledgment reconciliation: one uploaded scanned PDF of mixed BBMP acknowledgments, split → matched → attached to existing complaints after human review.';
comment on table public.ack_import_items is
  'One detected acknowledgment section: its page range in the original, extracted identifiers, AI-proposed complaint match + confidence, the human decision, and (once attached) the created complaint_documents row.';

notify pgrst, 'reload schema';
