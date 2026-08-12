-- -----------------------------------------------------------------------------
-- 0026_advisor_thread_intelligence — turn the AI Complaint Advisor from a
--   point-in-time narrator into a continuous, full-correspondence decision
--   engine. The engine now reasons over the whole thread (every department
--   reply, every AI-generated counter-reply/reminder/escalation letter, every
--   document, the timeline, and the PREVIOUS recommendation) on each new piece
--   of correspondence, and persists what it found so the next round can verify
--   against it:
--     • outstanding_issues — questions/demands still open, carried round to round
--     • contradictions     — where a reply conflicts with an earlier reply
--     • commitments        — promises the department made + whether they were kept
--     • confidence_score   — numeric 0-100 companion to the High/Med/Low band
--     • analyzed_correspondence_count — how many items the last deep pass covered
--   Plus a new recommendation_action: 'request_clarification'.
--
--   NOTE ON RE-RUNS: scripts/migrate.ts re-applies every file, so everything
--   here is idempotent (add column if not exists; the CHECK is dropped-then-
--   re-added by a stable name every run).
-- -----------------------------------------------------------------------------

alter table public.complaint_ai_recommendations add column if not exists outstanding_issues jsonb not null default '[]';
alter table public.complaint_ai_recommendations add column if not exists contradictions jsonb not null default '[]';
alter table public.complaint_ai_recommendations add column if not exists commitments jsonb not null default '[]';
alter table public.complaint_ai_recommendations add column if not exists confidence_score int;
alter table public.complaint_ai_recommendations add column if not exists analyzed_correspondence_count int;

do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_schema = 'public'
      and table_name = 'complaint_ai_recommendations'
      and constraint_name = 'ai_reco_confidence_score_range'
  ) then
    alter table public.complaint_ai_recommendations
      add constraint ai_reco_confidence_score_range
      check (confidence_score is null or confidence_score between 0 and 100);
  end if;
end $$;

-- Widen the recommendation_action CHECK to include 'request_clarification'.
-- The original constraint was declared inline (auto-named); drop whichever name
-- is present, then add a stably-named one. Drop-then-add is safe on every
-- re-run because the drop is unconditional-if-exists and the add follows it.
alter table public.complaint_ai_recommendations
  drop constraint if exists complaint_ai_recommendations_recommendation_action_check;
alter table public.complaint_ai_recommendations
  drop constraint if exists ai_reco_recommendation_action_check;
alter table public.complaint_ai_recommendations
  add constraint ai_reco_recommendation_action_check
  check (recommendation_action in
    ('generate_reminder','escalate','counter_reply','wait','close','upload_evidence','review','none','request_clarification'));

comment on column public.complaint_ai_recommendations.outstanding_issues is
  'AI-tracked open issues carried forward across rounds: [{issue, firstRaisedOn, status:open|answered|partial}].';
comment on column public.complaint_ai_recommendations.contradictions is
  'Where a department reply conflicts with an earlier reply: [{summary, conflictsWith}].';
comment on column public.complaint_ai_recommendations.commitments is
  'Department promises + fulfilment: [{commitment, madeOn, dueBy, status:pending|fulfilled|overdue|unmet}].';

notify pgrst, 'reload schema';
