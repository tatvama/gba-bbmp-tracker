-- -----------------------------------------------------------------------------
-- 0028_document_summary_status — permanent per-document AI summaries everywhere.
--
--   Every document uploaded in ANY complaint workflow stage (Submit, Acknowledge,
--   Reply/Report, Escalate, Close) gets an AI summary generated ONCE right after
--   upload and stored permanently. The summary CONTENT already lives on
--   complaint_documents (ai_summary text + ai_extracted_json jsonb, added in
--   0004); this migration adds the lifecycle STATE so the UI can show
--   "Generating…", "Retry" on failure, and "View Summary" (which reads the stored
--   value and never re-calls the AI):
--
--     ai_summary_status: 'none'       — no summary yet (pre-existing / AI off)
--                        'generating' — generation in flight (spinner)
--                        'ready'      — stored; "View Summary" reads it
--                        'failed'     — generation errored; "Retry Summary"
--
--   NOTE ON RE-RUNS: scripts/migrate.ts re-applies every file, so everything here
--   is idempotent. The backfill only promotes documents that ALREADY have a
--   stored summary to 'ready' — it never triggers generation or touches rows a
--   user has since changed.
-- -----------------------------------------------------------------------------

alter table public.complaint_documents add column if not exists ai_summary_status text not null default 'none';

do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_schema = 'public' and table_name = 'complaint_documents' and constraint_name = 'complaint_documents_ai_summary_status_check'
  ) then
    alter table public.complaint_documents
      add constraint complaint_documents_ai_summary_status_check
      check (ai_summary_status in ('none', 'generating', 'ready', 'failed'));
  end if;
end $$;

alter table public.complaint_documents add column if not exists ai_summary_error text;
alter table public.complaint_documents add column if not exists ai_summary_generated_at timestamptz;

-- Lets the document list cheaply find docs still generating (for polling) without
-- scanning every row of large cases.
create index if not exists idx_complaint_documents_summary_generating
  on public.complaint_documents (complaint_id)
  where ai_summary_status = 'generating';

comment on column public.complaint_documents.ai_summary_status is
  'AI-summary lifecycle: none (not generated), generating (in flight), ready (stored in ai_summary/ai_extracted_json — View Summary reads it, never regenerates), failed (retryable).';

-- Backfill: any document that already has a stored summary is 'ready'. Safe on
-- re-run — it only ever moves 'none' rows that genuinely carry a summary.
update public.complaint_documents
set ai_summary_status = 'ready',
    ai_summary_generated_at = coalesce(ai_summary_generated_at, updated_at)
where ai_summary_status = 'none'
  and (ai_extracted_json is not null or (ai_summary is not null and btrim(ai_summary) <> ''));

notify pgrst, 'reload schema';
