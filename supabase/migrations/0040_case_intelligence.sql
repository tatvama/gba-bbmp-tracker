-- -----------------------------------------------------------------------------
-- 0040 — Case Intelligence Engine artifact cache.
--
-- One cached row per complaint (upserted, never a history log). Holds the
-- versioned, evidence-linked CaseIntelligence artifact produced by lib/intelligence/*
-- (knowledge graph + findings + financials + chronology + compliance + legal +
-- synthesis + verification). Recomputed only when context_hash changes or the
-- engine/prompt version is bumped. Accessed via the admin client (mirrors the
-- convention of 0023_ai_advisor.sql).
-- -----------------------------------------------------------------------------

create table if not exists public.case_intelligence (
  id                       uuid primary key default gen_random_uuid(),
  complaint_id             uuid not null unique references public.complaints (id) on delete cascade,

  -- The full CaseIntelligence artifact (graph, evidence, findings, synthesis, …).
  artifact                 jsonb,

  -- Cache-invalidation + provenance
  context_hash             text,
  engine_version           text,
  model                    text,
  ai_configured_at_build   boolean not null default false,
  -- Whether the AI synthesis actually ran (vs the deterministic fallback). Lets
  -- the cache gate self-heal: a fallback-only artifact is rebuilt once AI is
  -- available, even after a transient outage (env key present but call failed).
  ai_synthesis_used        boolean not null default false,

  -- Single-flight bookkeeping
  build_status             text not null default 'idle'
                             check (build_status in ('idle','queued','running','done','failed')),
  build_error              text,
  built_at                 timestamptz,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_case_intel_status on public.case_intelligence (build_status);
create index if not exists idx_case_intel_hash on public.case_intelligence (context_hash);

drop trigger if exists set_case_intel_updated on public.case_intelligence;
create trigger set_case_intel_updated before update on public.case_intelligence
  for each row execute function public.set_updated_at();

comment on table public.case_intelligence is 'Cached Case Intelligence Engine artifact — one row per complaint, upserted. Recomputed only when context_hash / engine_version / prompt version changes.';

notify pgrst, 'reload schema';
