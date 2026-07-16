-- -----------------------------------------------------------------------------
-- 0042 — Translation cache for on-demand English rendering of Kannada free-text.
--
-- The app's static UI i18n (lib/i18n) deliberately never touches AI-generated
-- or user-entered free text. But the Case File and Evidence Dossier pages need
-- to show the actual EXTRACTED CONTENT (forensic findings, AA/TS/KW-4/tender
-- references, complaint narrative, timeline) in English when the reader can't
-- read Kannada. This table caches those AI translations keyed by a hash of the
-- source text, so a repeated string (and a repeat page view) never re-hits the
-- model. Accessed via the admin client (mirrors 0023/0040 convention).
-- -----------------------------------------------------------------------------

create table if not exists public.translation_cache (
  source_hash       text primary key,
  target_lang       text not null default 'en',
  translated_text   text not null,
  created_at        timestamptz not null default now()
);

notify pgrst, 'reload schema';
