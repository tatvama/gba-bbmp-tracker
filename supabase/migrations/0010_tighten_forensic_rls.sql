-- =============================================================================
-- 0010_tighten_forensic_rls — restrict read access to forensic audits & letter
-- drafts to write-capable roles (verifier / complaint-manager / editor / admin).
--
-- 0008 and 0009 shipped with `for select using (true)` — world-readable with the
-- anon key. These tables hold un-filed suspicions, contractor/officer names, loss
-- figures and draft Lokayukta letters (incl. the signatory's contact details),
-- which are MORE sensitive than the OCR they summarise. Lock reads to can_write().
--
-- Idempotent. Run with: npm run db:migrate
-- =============================================================================

do $$
declare t text;
begin
  foreach t in array array['job_audits', 'letter_drafts'] loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select using (public.can_write())', t, t);
  end loop;
end $$;
