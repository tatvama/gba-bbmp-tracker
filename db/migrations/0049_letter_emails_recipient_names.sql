-- =============================================================================
-- 0049_letter_emails_recipient_names — record WHO a manually-addressed letter
-- email was sent to, not just the address.
--
-- The officer directory has no email for large parts of the city (the imported
-- ARO set covers wards 1-198 only, and unassigned cases resolve to nobody), so
-- users address letters by typing an officer name and email at send time. The
-- name is what makes the audit row meaningful a year later — "we wrote to the
-- Executive Engineer, Bommanahalli" rather than a bare gmail address with no
-- officer_id to join against.
--
-- intended_to/to_addresses keep holding the addresses; this adds the names
-- alongside them, plus where each came from (directory pick vs typed in).
--
-- Idempotent. Run with: npm run db:migrate
-- =============================================================================

alter table public.letter_emails
  -- [{ "name": "...", "email": "...", "source": "directory" | "manual", "role": "to" | "cc" }]
  add column if not exists recipients jsonb;

notify pgrst, 'reload schema';
