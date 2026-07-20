-- -----------------------------------------------------------------------------
-- 0045 — AI Advisor language switching (English / Kannada).
--
-- The advisor was Kannada-only: one row per complaint in
-- complaint_ai_recommendations held the narrative in a single language. This
-- adds an English/Kannada toggle on the panel. To avoid re-running the AI on
-- every switch, each language's generated narrative is CACHED in `narratives`
-- (a jsonb map lang -> snapshot), valid for the current context_hash; toggling
-- to a language already cached at the current case-state is instant and free.
--
--   narrative_language  the language currently projected into the flat columns
--                       (current_situation, reasoning, …) — 'kn' (default) | 'en'
--   narratives          { "kn": {...snapshot}, "en": {...snapshot} } — only ever
--                       holds entries generated at the current context_hash;
--                       cleared/replaced when the case state changes.
-- -----------------------------------------------------------------------------

alter table public.complaint_ai_recommendations
  add column if not exists narrative_language text not null default 'kn',
  add column if not exists narratives jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
