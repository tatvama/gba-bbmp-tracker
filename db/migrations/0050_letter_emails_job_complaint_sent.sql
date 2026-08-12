-- =============================================================================
-- 0050_letter_emails_job_complaint_sent — widen the job idempotency guard from
-- 0048 to allow a DIGEST job (one job_id, several complaints) to mark several
-- outbox rows 'sent'.
--
-- 0048's uq_letter_emails_job_sent was `unique (job_id) where status = 'sent'`
-- — correct for every job type at the time, where one job always produced
-- exactly one outbox row. The overdue-alert digest breaks that: one officer
-- accountable for several overdue complaints gets ONE email but ONE outbox row
-- PER COMPLAINT it covers (so each complaint's own Email History still shows
-- the alert it was part of — see lib/mail/overdue-alert.ts). Marking that
-- digest's rows 'sent' hit 0048's index and failed with a duplicate-key error
-- on the second row, leaving every row after the first stuck at 'sending'
-- forever (caught by scripts/verify-overdue-alert.ts against real data).
--
-- Re-scoping to (job_id, complaint_id) preserves 0048's actual guarantee — a
-- concurrent/retried attempt for the SAME job AND the SAME complaint still
-- loses the race rather than double-sending — while allowing the several
-- complaints a single digest job legitimately covers to each reach 'sent'.
--
-- Idempotent. Run with: npm run db:migrate
-- =============================================================================

drop index if exists public.uq_letter_emails_job_sent;

create unique index if not exists uq_letter_emails_job_complaint_sent
  on public.letter_emails (job_id, complaint_id)
  where job_id is not null and status = 'sent';

notify pgrst, 'reload schema';
