-- -----------------------------------------------------------------------------
-- 0020_job_photo_dedupe — cross-job-code duplicate-photo detection (VISUAL).
--   The same site photo is sometimes reused under different job codes (esp. in
--   one division). When it is printed onto a document and scanned/re-photographed,
--   pixel hashes (sha/phash/dhash) NO LONGER match — so the primary matcher is
--   vision AI. Hashes stay as a free fast-path for verbatim digital re-use.
--
--   This migration:
--     • indexes job_documents fingerprint columns (fast path, like 0005 did for
--       complaint_documents),
--     • adds a per-photo vision descriptor (ai_photo_descriptor + visual_phrase)
--       to job_documents AND complaint_documents (for cheap candidate shortlisting),
--     • adds photo_match_verdicts — a cache so each pairwise vision judgement is
--       computed once and reused.
--   Idempotent. Run with: npm run db:migrate
-- -----------------------------------------------------------------------------

-- Fast-path fingerprint indexes on job_documents (mirror idx_cdoc_* from 0005) --
create index if not exists idx_jdoc_sha256 on public.job_documents (file_sha256) where file_sha256 is not null;
create index if not exists idx_jdoc_phash  on public.job_documents (phash)       where phash is not null;
create index if not exists idx_jdoc_dhash  on public.job_documents (dhash)       where dhash is not null;
create index if not exists idx_jdoc_gps    on public.job_documents (exif_gps_lat, exif_gps_lon) where exif_gps_lat is not null;
create index if not exists idx_jdoc_dupe   on public.job_documents (is_duplicate) where is_duplicate;

-- Per-photo vision descriptor (the visual signature) ---------------------------
alter table public.job_documents       add column if not exists ai_photo_descriptor jsonb;
alter table public.job_documents       add column if not exists visual_phrase       text;
alter table public.complaint_documents add column if not exists ai_photo_descriptor jsonb;
alter table public.complaint_documents add column if not exists visual_phrase       text;

-- Pairwise vision verdict cache ------------------------------------------------
create table if not exists public.photo_match_verdicts (
  id            uuid primary key default gen_random_uuid(),
  doc_a         uuid not null,                 -- document id (job_documents or complaint_documents)
  doc_b         uuid not null,
  basis         text not null default 'visual',-- hash | visual
  verdict       text not null,                 -- same | different | unclear
  confidence    text,                          -- High | Medium | Low
  shared_details text,                         -- model's explanation of shared features
  model         text,
  checked_at    timestamptz not null default now(),
  created_by    uuid references public.profiles (id) on delete set null,
  unique (doc_a, doc_b)
);
create index if not exists idx_photo_verdicts_a on public.photo_match_verdicts (doc_a);
create index if not exists idx_photo_verdicts_b on public.photo_match_verdicts (doc_b);

alter table public.photo_match_verdicts enable row level security;

drop policy if exists "photo_match_verdicts_read" on public.photo_match_verdicts;
create policy "photo_match_verdicts_read" on public.photo_match_verdicts for select using (public.can_write());

drop policy if exists "photo_match_verdicts_insert" on public.photo_match_verdicts;
create policy "photo_match_verdicts_insert" on public.photo_match_verdicts for insert with check (public.can_write());

drop policy if exists "photo_match_verdicts_update" on public.photo_match_verdicts;
create policy "photo_match_verdicts_update" on public.photo_match_verdicts for update using (public.can_write()) with check (public.can_write());

drop policy if exists "photo_match_verdicts_delete" on public.photo_match_verdicts;
create policy "photo_match_verdicts_delete" on public.photo_match_verdicts for delete using (public.is_admin());

notify pgrst, 'reload schema';
