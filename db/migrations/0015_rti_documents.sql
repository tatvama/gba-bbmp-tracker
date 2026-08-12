-- -----------------------------------------------------------------------------
-- 0015_rti_documents — document-first RTI tracking.
--   One row per uploaded document (a merged PDF). Replaces the single-slot
--   acknowledgement columns from 0014 with a flexible, typed document list:
--   Application, Acknowledgement, Reply, FAA Order, etc. Each document is
--   captured/scanned, merged into one PDF, OCR'd and summarised.
--   The legacy ack_* columns on rti_applications are left in place (unused) and
--   may be dropped by a later cleanup migration.
-- -----------------------------------------------------------------------------
create table if not exists public.rti_documents (
  id              uuid primary key default gen_random_uuid(),
  rti_id          uuid not null references public.rti_applications (id) on delete cascade,
  doc_type        text not null default 'Other',  -- Application | Acknowledgement | Reply | FAA Order | Second Appeal Order | Other
  title           text,
  pdf_path        text not null,                   -- merged PDF in the rti-documents bucket
  page_count      integer not null default 1,
  file_size       integer,
  source          text,                            -- camera | scan-pdf | upload
  doc_date        date,                            -- date written on the document (filing date / reply date)
  ocr_text        text,
  ocr_confidence  integer,
  ocr_status      text not null default 'Pending', -- Pending | Processing | Completed | Failed | Skipped
  ai_summary      text,
  ai_extracted    jsonb,                           -- { authority, subject, referenceNumber, documentDate, keyDates:[{label,date}] }
  ai_status       text not null default 'Pending', -- Pending | Processing | Completed | Failed | Skipped
  uploaded_by     uuid references public.profiles (id) on delete set null,
  uploader_name   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_rti_documents_rti     on public.rti_documents (rti_id);
create index if not exists idx_rti_documents_type     on public.rti_documents (doc_type);
create index if not exists idx_rti_documents_created on public.rti_documents (created_at desc);

-- updated_at trigger (reuse public.set_updated_at from 0001)
drop trigger if exists trg_updated_at on public.rti_documents;
create trigger trg_updated_at before update on public.rti_documents
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security — public-read (civic transparency, like the parent RTI
-- record); writes follow the standard can_write/can_verify/is_admin pattern.
-- -----------------------------------------------------------------------------
alter table public.rti_documents enable row level security;

drop policy if exists "rti_documents_read" on public.rti_documents;
create policy "rti_documents_read" on public.rti_documents for select using (true);

drop policy if exists "rti_documents_insert" on public.rti_documents;
create policy "rti_documents_insert" on public.rti_documents for insert with check (public.can_write());

drop policy if exists "rti_documents_update" on public.rti_documents;
create policy "rti_documents_update" on public.rti_documents for update using (public.can_verify()) with check (public.can_verify());

drop policy if exists "rti_documents_delete" on public.rti_documents;
create policy "rti_documents_delete" on public.rti_documents for delete using (public.is_admin());
