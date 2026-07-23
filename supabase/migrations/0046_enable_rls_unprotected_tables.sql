-- =============================================================================
-- 0046_enable_rls_unprotected_tables — close the rls_disabled_in_public advisor
-- finding on the 10 public tables added in 0022+ that shipped without RLS.
--
-- The browser-facing publishable/anon key (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
-- lib/supabase/client.ts) ships to every visitor, and Supabase grants the anon
-- role default access to public tables (no REVOKE anywhere), so RLS is the only
-- gate. With RLS off, anyone with the project URL + that public key can read,
-- edit or delete every row directly via the REST API, bypassing the app's
-- requireRole checks (which only guard the app's own code paths).
--
-- All 10 tables are accessed exclusively via the service-role admin client
-- (lib/supabase/admin.ts), which BYPASSES RLS. So enabling RLS with no policies
-- denies the anon/authenticated roles entirely while leaving server-side access
-- untouched (deny-by-default — codifies the "admin-only access" intent stated in
-- the 0023/0024/0030/0031/0040/0042 migration comments).
--
-- Exception: escalation_flow_configs is ALSO read by the logged-in-user cookie
-- client via listEscalationFlowConfigs() (lib/queries.ts), so it additionally
-- gets a single authenticated select policy. Its writes use the admin client
-- (lib/actions/escalation-flow.ts), which bypasses RLS.
--
-- Idempotent. Run with: npm run db:migrate
-- =============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'background_jobs','notifications','complaint_ai_recommendations','import_uploads',
    'ack_import_batches','ack_import_items','complaint_cycle_events',
    'escalation_flow_configs','case_intelligence','translation_cache'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- escalation_flow_configs is read by logged-in users via the cookie client
-- (lib/queries.ts listEscalationFlowConfigs). Writes use the admin client, which
-- bypasses RLS. Mirror the audit_logs/import_logs/profiles pattern from 0001.
drop policy if exists "escalation_flow_configs_read" on public.escalation_flow_configs;
create policy "escalation_flow_configs_read" on public.escalation_flow_configs
  for select using (auth.uid() is not null);

notify pgrst, 'reload schema';
