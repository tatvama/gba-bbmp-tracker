-- =============================================================================
-- 0038_complaint_ack_officer — capture the officer/engineer named on an
--   acknowledgment as FREE TEXT on the complaint.
--
-- WHY: when a scanned BBMP acknowledgment is matched + attached to a complaint
-- (lib/complaints/ack-attach.ts), the acknowledgment often names/stamps the
-- engineer or officer who received it. That name is now extracted and stored
-- here. This is DELIBERATELY plain text, NOT a contacts FK like
-- assigned_engineer_id — per product decision the acknowledgment officer is
-- recorded as-read off the document and kept separate from the curated
-- contacts directory (no lookup, no auto-created contact).
--
-- Free-text, nullable, no default. Filled empty-only at attach time (never
-- overwrites an existing value). Idempotent: ADD COLUMN IF NOT EXISTS.
-- Run with: npm run db:migrate
-- =============================================================================
alter table public.complaints add column if not exists ack_officer_name text;

notify pgrst, 'reload schema';
