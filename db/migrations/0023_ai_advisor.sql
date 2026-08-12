-- AI Complaint Advisor: one cached recommendation row per complaint (upserted,
-- never a history log — background_jobs already retains one row per analysis
-- run via a lightweight analysis_status, and complaint_timeline already logs
-- the human-triggered outcomes of a one-click action, so this table only ever
-- holds the CURRENT advisory state for a complaint).

create table if not exists public.complaint_ai_recommendations (
  id                            uuid primary key default gen_random_uuid(),
  complaint_id                  uuid not null unique references public.complaints (id) on delete cascade,

  -- Deterministic (free, synchronous, no AI call) — always kept fresh.
  health_score                  int not null default 100 check (health_score between 0 and 100),
  risk_level                    text not null default 'Low' check (risk_level in ('Low','Medium','High','Critical')),
  risk_factors                  jsonb not null default '[]',

  -- AI-generated narrative (cached; recomputed only when context_hash changes)
  current_situation             text,
  reasoning                     text,
  expected_outcome              text,
  confidence                    text check (confidence in ('High','Medium','Low')),
  recommendation                text,
  recommendation_action         text check (recommendation_action in
    ('generate_reminder','escalate','counter_reply','wait','close','upload_evidence','review','none')),
  missing_information           jsonb not null default '[]',
  detected_risks                jsonb not null default '[]',
  timeline_summary              text,

  -- Cache-invalidation + single-flight bookkeeping
  context_hash                  text,
  last_analyzed_at              timestamptz,
  analysis_status               text not null default 'idle' check (analysis_status in ('idle','queued','running','done','failed')),
  analysis_error                text,
  ai_configured_at_analysis     boolean not null default false,

  -- Duplicate-prevention state for the reminder/escalation workflow
  last_reminder_generated_at    timestamptz,
  last_reminder_draft_id        uuid references public.ai_drafts (id) on delete set null,
  last_escalation_generated_at  timestamptz,
  last_escalation_draft_id      uuid references public.ai_drafts (id) on delete set null,

  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

create index if not exists idx_ai_reco_risk on public.complaint_ai_recommendations (risk_level, health_score);
create index if not exists idx_ai_reco_action on public.complaint_ai_recommendations (recommendation_action);
create index if not exists idx_ai_reco_status on public.complaint_ai_recommendations (analysis_status);

drop trigger if exists set_ai_reco_updated on public.complaint_ai_recommendations;
create trigger set_ai_reco_updated before update on public.complaint_ai_recommendations
  for each row execute function public.set_updated_at();

comment on table public.complaint_ai_recommendations is 'Cached AI Complaint Advisor state — one row per complaint, upserted. Deterministic health/risk fields are recomputed synchronously and cheaply; AI narrative fields are recomputed asynchronously only when context_hash changes.';

notify pgrst, 'reload schema';
