-- =============================================================================
-- 0047_performance_indexes — close missing-index gaps found in a performance
-- audit of the app's hottest query paths (complaint detail page's 14-way
-- Promise.all, the officer scorecard, the dashboard, and the polled Task
-- Center). Every query below already runs in application code; it was just
-- forcing a full table scan (or scan + separate sort) for lack of a covering
-- index. Purely additive — no data or behavior changes.
--
-- Idempotent. Applied automatically on next app start (lib/startup/migrations.ts)
-- or via: npm run db:migrate
-- =============================================================================

-- letter_drafts.complaint_id had NO index at all (only job_number and
-- print_status were covered) — getComplaintLetterDraft() hits this on every
-- single complaint-detail-page view (app/complaints/[id]/page.tsx).
create index if not exists idx_letter_drafts_complaint
  on public.letter_drafts (complaint_id, created_at desc)
  where complaint_id is not null;

-- "latest audit for this job" (.eq(job_number).order(created_at desc).limit(1))
-- repeats across getJobAudit/listJobAudits, the letter-drafting actions, and the
-- case-intelligence ingest stage — 7+ call sites, none previously covered by a
-- composite index.
create index if not exists idx_job_audits_job_created
  on public.job_audits (job_number, created_at desc);

-- Global Task Center polls background_jobs for the current user every 5s
-- (app/api/jobs/events/route.ts) ordered by created_at desc; the existing
-- (created_by, status) index doesn't cover that sort.
create index if not exists idx_bg_jobs_user_created
  on public.background_jobs (created_by, created_at desc);

-- complaints.assigned_officer_id was never indexed, unlike its sibling
-- assigned_engineer_id — getOfficerScorecard() ORs across both columns on
-- every officer-detail-page view.
create index if not exists idx_complaints_officer
  on public.complaints (assigned_officer_id);

-- contacts.verification_status is filtered on every dashboard load
-- (getDashboardStats: VERIFIED/PENDING counts) and every "needs verification"
-- report, with zero index.
create index if not exists idx_contacts_verification
  on public.contacts (verification_status);

-- Plain "newest notifications for this user" read (lib/actions/jobs.ts) has no
-- read_at filter, so the existing (user_id, read_at, created_at) index can't
-- serve it as a pure index-ordered scan.
create index if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc);

-- "High-risk jobs" digest (getNotificationDigest) filters risk_band with no
-- supporting index.
create index if not exists idx_job_audits_risk_band
  on public.job_audits (risk_band)
  where risk_band is not null;

-- listLetterDrafts() / the job-audit letter route both filter by job_number and
-- sort by created_at desc — same filter+sort gap as job_audits above.
create index if not exists idx_letter_drafts_job_created
  on public.letter_drafts (job_number, created_at desc);

-- The remaining five all follow the same pattern already applied to
-- complaint_timeline in 0004 (idx_ctl_complaint) but never got the follow-up:
-- each is read on every complaint-detail-page load, filtered by the parent id
-- and sorted newest-first, with only a single-column index today.
create index if not exists idx_ai_drafts_entity_created
  on public.ai_drafts (entity_type, entity_id, created_at desc);

create index if not exists idx_escalation_logs_entity_created
  on public.escalation_logs (entity_type, entity_id, created_at desc);

create index if not exists idx_creply_complaint_created
  on public.complaint_replies (complaint_id, created_at desc);

create index if not exists idx_cact_complaint_created
  on public.complaint_action_taken (complaint_id, created_at desc);

create index if not exists idx_cdoc_complaint_uploaded
  on public.complaint_documents (complaint_id, uploaded_at desc);
