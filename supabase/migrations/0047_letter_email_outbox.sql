-- =============================================================================
-- 0047_letter_email_outbox — audit trail for letters emailed to officials.
--
-- Every attempt to email a filed letter writes exactly one row here BEFORE the
-- SMTP call and updates it after, so a send is never invisible: a crash mid-send
-- leaves a 'sending' row rather than nothing, and a disabled/misconfigured mail
-- setup leaves a 'skipped' row recording who WOULD have been written to.
--
-- The intended_* columns are the point of this table. While MAIL_REDIRECT_TO is
-- set, `to_addresses` holds only the test inbox, and intended_to/intended_cc hold
-- the officials who were deliberately NOT contacted. That distinction is the
-- record that test mode was in force, and it is why the two are separate columns
-- rather than one.
--
-- No credential is stored here. The Gmail app password lives only in the
-- environment (see .env.example) — app_settings is world-readable
-- (0003_phase2.sql: `for select using (true)`) and must never hold secrets.
--
-- RLS: deny-by-default, following 0046. This table is written and read only via
-- the service-role admin client (lib/supabase/admin.ts), which bypasses RLS, so
-- enabling RLS with no policies denies anon/authenticated entirely. Officer email
-- addresses are personal data and must not be reachable with the public key.
--
-- Idempotent. Run with: npm run db:migrate
-- =============================================================================

create table if not exists public.letter_emails (
  id                uuid primary key default gen_random_uuid(),
  complaint_id      uuid references public.complaints (id) on delete cascade,
  -- The letter PDF that was attached. set null so purging a document does not
  -- erase the evidence that it was emailed.
  document_id       uuid references public.complaint_documents (id) on delete set null,
  letter_kind       text,                       -- 'Complaint letter', 'Reminder letter', …
  -- Who the mail server was actually told to deliver to.
  to_addresses      text[] not null default '{}',
  cc_addresses      text[] not null default '{}',
  -- Who we meant to write to. Differs from the above only in redirect mode.
  intended_to       text[] not null default '{}',
  intended_cc       text[] not null default '{}',
  redirected        boolean not null default false,
  -- The resolved officer, when the recipient came from the contact directory.
  officer_id        uuid references public.contacts (id) on delete set null,
  subject           text,
  body              text,
  attachment_name   text,
  status            text not null default 'queued'
                      check (status in ('queued','sending','sent','failed','skipped')),
  -- Populated for 'skipped' (mail disabled/unconfigured) and 'failed' (SMTP said no).
  error             text,
  -- The provider's Message-ID, so a delivery can be traced in the Gmail account.
  message_id        text,
  mail_mode         text,                       -- disabled | unconfigured | redirect | live
  sent_at           timestamptz,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists idx_letter_emails_complaint
  on public.letter_emails (complaint_id, created_at desc);
create index if not exists idx_letter_emails_status
  on public.letter_emails (status)
  where status in ('queued', 'sending', 'failed');

alter table public.letter_emails enable row level security;

notify pgrst, 'reload schema';
