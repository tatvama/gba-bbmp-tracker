-- =============================================================================
-- 0048_letter_emails_job_id — make an email_send retry idempotent.
--
-- Gmail can accept the DATA payload and then drop the pooled connection before
-- nodemailer reads the final 250 ("read ECONNRESET" is routine). The send has
-- happened, but the client sees a transient error — which the email_send job
-- config quite correctly treats as retryable. Without a record tying a delivery
-- to the job that made it, each retry sends the letter again: up to
-- 1 + maxRetries = 4 copies to the same official.
--
-- Recording the job id on the outbox row lets lib/mail/send.ts check "has THIS
-- job already delivered?" before dialling out, and return the earlier success
-- instead of re-sending.
--
-- Idempotent. Run with: npm run db:migrate
-- =============================================================================

alter table public.letter_emails
  add column if not exists job_id uuid references public.background_jobs (id) on delete set null;

-- Partial: only successful sends need to be found by job, and only one row per
-- job can be 'sent'. The unique constraint is the actual guard — a concurrent
-- second attempt by the same job loses the insert rather than double-sending.
create unique index if not exists uq_letter_emails_job_sent
  on public.letter_emails (job_id)
  where job_id is not null and status = 'sent';

notify pgrst, 'reload schema';
