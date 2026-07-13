-- =============================================================================
-- 0037_bbmp_works_admin — search history + division old/new name mapping.
--
--   search_history: logs every BBMP work-search query (rule 19). Insert-only,
--   permissive (even anon can insert, so the public search UI still logs) —
--   select restricted to signed-in staff (admin "recent searches" panel).
--   user_id is nullable because a public/anonymous search still logs.
--
--   divisions.old_names: mirrors wards.old_wards (0001_init.sql) — an
--   old-name array for divisions whose names have changed, so both old and
--   current names can be shown (spec rule 16) and the work-search division
--   tier can still match a legacy name.
--
--   Idempotent. Run with: npm run db:migrate
-- =============================================================================

create table if not exists public.search_history (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references public.profiles (id) on delete set null,
  query_params   jsonb not null default '{}'::jsonb,
  result_count   integer not null default 0,
  searched_at    timestamptz not null default now()
);
create index if not exists idx_search_history_searched on public.search_history (searched_at desc);

alter table public.divisions add column if not exists old_names text[] not null default '{}';

alter table public.search_history enable row level security;
drop policy if exists "search_history_read" on public.search_history;
create policy "search_history_read" on public.search_history for select using (auth.uid() is not null);
drop policy if exists "search_history_insert" on public.search_history;
create policy "search_history_insert" on public.search_history for insert with check (true);

notify pgrst, 'reload schema';
