-- -----------------------------------------------------------------------------
-- 0031_escalation_cycle — the no-reply / reply escalation ladder.
--
--   Once a complaint's acknowledgment (OC copy) is uploaded, the department has
--   a fixed number of days to reply before the system auto-drafts the next
--   letter in a ladder and queues it for print (reusing letter_drafts.print_status
--   from 0025 — no new print-side UI needed):
--
--     awaiting_ack       — filed, waiting for the user to upload the stamped ack.
--     awaiting_reply      --14 calendar days--> reminder_sent
--     reminder_sent       --7 working days-->   legal_notice_sent
--     legal_notice_sent   --7 working days-->   escalated (Lokayukta / Chief
--                                                Secretary / CM office — all three
--                                                drafted, human picks which to send)
--     replied             — a department reply halts the ladder immediately.
--     closed              — terminal.
--
--   A reply always wins: whatever stage a complaint is in, a recorded reply sets
--   escalation_stage='replied' and clears the deadline. Filing our counter-reply
--   back out re-arms the SAME ladder at escalation_round + 1, starting again from
--   awaiting_reply — so every round of correspondence gets the same treatment,
--   not just the first.
--
--   escalation_flow_configs is the single source of truth the scheduler reads
--   (lib/complaints/escalation-scheduler.ts) AND the future drag-drop
--   process-flow page writes to — editing a row's sla_days/sla_unit/
--   on_elapse_draft_kind changes the ladder's behavior with no code change.
--
--   complaint_cycle_events is an append-only audit trail AND the scheduler's
--   idempotency guard (never draft the same stage's letter twice for the same
--   complaint + round).
--
--   Kept separate from complaints.status (which drives the existing 5-step
--   workflow UI and has broader meaning) — this is finer-grained lifecycle state
--   layered on top, not a replacement.
--
--   Access is via the admin (service-role) client behind app-level requireRole
--   checks — same pattern as every other complaints-adjacent table — so no
--   row-level policies are declared here.
--
--   NOTE ON RE-RUNS: scripts/migrate.ts re-applies every file — everything here
--   must be idempotent.
-- -----------------------------------------------------------------------------

-- letter_drafts.job_number was NOT NULL because every row used to come from the
-- forensic job-audit pipeline. The scheduler below drafts reminder/legal-notice/
-- escalation letters for ANY complaint, including manually-created ones with no
-- forensic job code — so a complaint-only letter_drafts row needs job_number to
-- be optional. variant/content already supported a non-skeleton "freeform text"
-- letter (see print-queue-list.tsx's content-fallback preview path); this just
-- lets that path be reached without a job code.
alter table public.letter_drafts alter column job_number drop not null;

alter table public.complaints add column if not exists escalation_stage text not null default 'awaiting_ack';
alter table public.complaints add column if not exists escalation_stage_deadline timestamptz;
alter table public.complaints add column if not exists escalation_stage_entered_at timestamptz;
alter table public.complaints add column if not exists escalation_round integer not null default 1;

do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_schema = 'public' and table_name = 'complaints' and constraint_name = 'complaints_escalation_stage_check'
  ) then
    alter table public.complaints
      add constraint complaints_escalation_stage_check
      check (escalation_stage in ('awaiting_ack','awaiting_reply','reminder_sent','legal_notice_sent','escalated','replied','closed'));
  end if;
end $$;

create index if not exists idx_complaints_escalation_deadline
  on public.complaints (escalation_stage_deadline)
  where escalation_stage in ('awaiting_reply','reminder_sent','legal_notice_sent');

comment on column public.complaints.escalation_stage is
  'No-reply escalation ladder stage. Independent of status: awaiting_ack (no clock yet) -> awaiting_reply (14 calendar days from acknowledgment_date) -> reminder_sent (7 working days) -> legal_notice_sent (7 working days) -> escalated (terminal, Lokayukta/Chief Secretary/CM letters drafted). replied/closed halt the ladder.';
comment on column public.complaints.escalation_stage_deadline is
  'When the CURRENT stage elapses and the scheduler should draft the next letter. Computed once on stage entry (working-day aware), not recomputed from raw calendar math each run. Null when idle (awaiting_ack/replied/closed).';
comment on column public.complaints.escalation_round is
  'Increments each time a reply arrives and our counter-reply re-arms the ladder — round 1 is the original letter, round 2 is the first counter-reply, etc.';

create table if not exists public.complaint_cycle_events (
  id                    uuid primary key default gen_random_uuid(),
  complaint_id          uuid not null references public.complaints (id) on delete cascade,
  round                 integer not null default 1,
  stage                 text not null,
  event                 text not null
                        check (event in ('ack_uploaded','reminder_sent','legal_notice_sent','escalated','reply_received','counter_reply_filed')),
  letter_draft_id       uuid references public.letter_drafts (id) on delete set null,
  ai_draft_id           uuid references public.ai_drafts (id) on delete set null,
  complaint_document_id uuid references public.complaint_documents (id) on delete set null,
  created_at            timestamptz not null default now()
);

create index if not exists idx_cycle_events_complaint on public.complaint_cycle_events (complaint_id, round, created_at);
-- Idempotency guard: the scheduler checks "have I already fired this stage's
-- letter for this round" before drafting again.
create index if not exists idx_cycle_events_dedupe on public.complaint_cycle_events (complaint_id, round, event);

comment on table public.complaint_cycle_events is
  'Append-only audit trail of the escalation ladder: every ack upload, auto-drafted reminder/legal-notice/escalation letter, reply, and counter-reply-filed re-arm. Also the scheduler''s idempotency check.';

create table if not exists public.escalation_flow_configs (
  id                  uuid primary key default gen_random_uuid(),
  stage_key           text not null unique,
  label               text not null,
  sla_days            integer,
  sla_unit            text check (sla_unit in ('calendar','working')),
  on_elapse_draft_kind text,
  on_elapse_next_stage text not null,
  position_x          double precision not null default 0,
  position_y          double precision not null default 0,
  sort_order          integer not null default 0,
  is_active           boolean not null default true,
  updated_at          timestamptz not null default now()
);

drop trigger if exists set_escalation_flow_configs_updated on public.escalation_flow_configs;
create trigger set_escalation_flow_configs_updated before update on public.escalation_flow_configs
  for each row execute function public.set_updated_at();

comment on table public.escalation_flow_configs is
  'The escalation ladder''s configuration — single source of truth for both the scheduler (lib/complaints/escalation-scheduler.ts) and the drag-drop process-flow page. Editing sla_days/sla_unit/on_elapse_draft_kind changes ladder behavior with no code change.';
comment on column public.escalation_flow_configs.on_elapse_draft_kind is
  'ComplaintDraftKind to auto-draft when this stage''s SLA elapses. Null at legal_notice_sent — three escalation letters (Lokayukta/Chief Secretary/CM office) are drafted together and the human picks which to send.';

insert into public.escalation_flow_configs (stage_key, label, sla_days, sla_unit, on_elapse_draft_kind, on_elapse_next_stage, position_x, position_y, sort_order)
values
  ('awaiting_reply',    'Awaiting reply',       14, 'calendar', 'reminder_letter', 'reminder_sent',     0,   0, 1),
  ('reminder_sent',     'Reminder sent',         7, 'working',  'legal_notice',    'legal_notice_sent', 260, 0, 2),
  ('legal_notice_sent', 'Legal notice sent',     7, 'working',  null,              'escalated',         520, 0, 3)
on conflict (stage_key) do nothing;

notify pgrst, 'reload schema';
