-- =============================================================================
-- 0051_profiles_phone — let an admin-created user also sign in by phone number.
--
-- Mirrors auth.users.phone onto profiles the same way profiles.email already
-- mirrors auth.users.email — this column is a readable cache for the app's
-- own queries/UI, not the source of truth for login (that's auth.users,
-- enforced by Supabase Auth itself). Nullable and optional: most users still
-- sign in by email only; phone is an additional identifier an admin may set.
--
-- Idempotent. Run with: npm run db:migrate
-- =============================================================================

alter table public.profiles add column if not exists phone text;

notify pgrst, 'reload schema';
