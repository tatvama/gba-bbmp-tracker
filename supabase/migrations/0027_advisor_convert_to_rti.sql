-- -----------------------------------------------------------------------------
-- 0027_advisor_convert_to_rti — add 'convert_to_rti' to the advisor's
--   recommendation_action enum. When an escalation has stalled (escalated with
--   no response on record for a while), the decision engine can now recommend
--   converting the complaint into an RTI request to compel production of the
--   records under the RTI Act 2005 — surfaced as a one-click "Draft RTI".
--
--   Idempotent (drop-then-re-add the CHECK by its stable name). Re-applied on
--   every `npm run db:migrate`.
-- -----------------------------------------------------------------------------

alter table public.complaint_ai_recommendations
  drop constraint if exists ai_reco_recommendation_action_check;
alter table public.complaint_ai_recommendations
  add constraint ai_reco_recommendation_action_check
  check (recommendation_action in
    ('generate_reminder','escalate','counter_reply','wait','close','upload_evidence','review','none','request_clarification','convert_to_rti'));

notify pgrst, 'reload schema';
