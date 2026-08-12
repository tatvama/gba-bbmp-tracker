# Database

The application runs on its own PostgreSQL server. Supabase — Postgres, Auth,
Storage and RLS — is no longer used anywhere in this repository.

## Layout

| Path              | What it is                                                            |
| ----------------- | --------------------------------------------------------------------- |
| `baseline/schema.sql` | The complete current schema as plain PostgreSQL. **Start here for a new database.** |
| `migrations/`     | Historical migrations, applied in filename order and tracked in `schema_migrations`. |

## Creating a new database

Use the baseline, not the migration history:

```bash
createdb GBA_BBMP && psql -d GBA_BBMP -v ON_ERROR_STOP=1 -f db/baseline/schema.sql
```

`baseline/schema.sql` was produced by dumping the live schema and mechanically
stripping everything Supabase-specific: 197 RLS policies, the 64
`enable row level security` statements, the six helper functions that existed
only to serve those policies (`can_write`, `can_read`, `is_admin`, `user_role`,
`rls_auto_enable`, `handle_new_user`), and the `auth.users` foreign key. It adds
`public.app_users`, which replaces `auth.users`.

Migrations `0001`–`0052` are kept for history and **cannot** rebuild a database
on their own: they were written against Supabase and reference `auth.uid()`,
`auth.users` and `notify pgrst`. `npm run db:migrate` handles this correctly — on
a database that already has a `profiles` table it records every file as applied
without re-running it. So the sequence for a fresh database is: load the
baseline, then run `db:migrate`, which marks the history as applied and from then
on applies only genuinely new files.

New migrations must be plain PostgreSQL. In particular:

- no `auth.uid()` — the signed-in user is not visible to the database; the
  server connects as one trusted role and authorization is enforced in app code
  by `requireRole()` in `lib/auth.ts`
- reference `public.app_users(id)`, never `auth.users(id)`
- no RLS policies, and no `notify pgrst` (there is no PostgREST)

## Why there is no RLS

Nothing in the browser has ever held a database credential — there was no
browser-side Supabase client. Of the 97 server files that used one, 79 used the
service-role client, which bypassed RLS entirely. And of the 197 policies that
existed, none filtered rows by owner on a read; they gated writes by role, which
`requireRole()` already enforces before any query runs. Dropping RLS therefore
changed no behaviour.

## Authentication

Accounts live in `public.app_users`. Password hashes were carried over verbatim
from Supabase Auth — they are ordinary bcrypt (`$2a$`), verified by pgcrypto's
`crypt()` inside Postgres, so existing passwords kept working. Sessions are
HMAC-signed cookies (`lib/session.ts`), not JWTs from an auth service.
