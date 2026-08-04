-- =============================================================================
-- 0052_push_subscriptions — Web Push endpoints for the Android app (and any
-- installed PWA), so overdue work reaches a phone instead of only an inbox.
--
-- One row per DEVICE, not per user: endpoint is the unique key and user_id is
-- deliberately non-unique, because a staff member signing in on both a phone
-- and a desktop gets two independent push endpoints and must be reachable on
-- both. Re-subscribing the same browser returns the same endpoint, so the
-- subscribe action upserts on it (lib/actions/push.ts) rather than accumulating
-- duplicates.
--
-- WHO this reaches, and why it is not the same audience as the overdue-alert
-- EMAIL digest: that digest is addressed to external BBMP/GBA officers derived
-- from letter_emails.recipients (see the header of lib/complaints/
-- overdue-alert-scheduler.ts). Those officers are not app users and have no
-- browser subscription, so push cannot mirror it. Push targets signed-in staff
-- and mirrors what the notifications bell already shows them. The officer email
-- path is untouched by this migration.
--
-- The push keys are per-browser public values used to encrypt payloads to that
-- endpoint (p256dh) and to authenticate the sender (auth_key). They are not
-- user secrets, but an endpoint IS a capability to send that device a
-- notification, so RLS is owner-only: a user may only ever see or remove their
-- own devices. `auth_key` rather than `auth` to keep the column unambiguous
-- against Supabase's `auth` schema.
--
-- The SENDER (lib/push/send.ts, reached from the cron route with no session)
-- uses the service-role admin client, which bypasses RLS — the same pattern the
-- schedulers already rely on.
--
-- Idempotent. Run with: npm run db:migrate
-- =============================================================================

create table if not exists public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  endpoint        text not null unique,
  p256dh          text not null,
  auth_key        text not null,
  user_agent      text,
  created_at      timestamptz not null default now(),
  -- Last time the push service accepted a send. Lets a stale-but-not-yet-410
  -- device be spotted without reading the provider's logs.
  last_success_at timestamptz,
  -- Consecutive transient failures. 404/410 are pruned outright (the endpoint
  -- is permanently gone); this counts the retryable kind so a persistently
  -- failing device can be cleaned up later without guessing.
  failure_count   int not null default 0
);

-- The sender fans out per user; the bell reads the current user's own rows.
create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Owner-only. Mirrors the profiles/audit_logs policy shape from 0001.
drop policy if exists "push_subscriptions_own_select" on public.push_subscriptions;
create policy "push_subscriptions_own_select" on public.push_subscriptions
  for select using (user_id = auth.uid());

drop policy if exists "push_subscriptions_own_insert" on public.push_subscriptions;
create policy "push_subscriptions_own_insert" on public.push_subscriptions
  for insert with check (user_id = auth.uid());

drop policy if exists "push_subscriptions_own_update" on public.push_subscriptions;
create policy "push_subscriptions_own_update" on public.push_subscriptions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "push_subscriptions_own_delete" on public.push_subscriptions;
create policy "push_subscriptions_own_delete" on public.push_subscriptions
  for delete using (user_id = auth.uid());

notify pgrst, 'reload schema';
