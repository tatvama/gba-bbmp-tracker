---
name: bbmp-stack-override
description: "BBMP ward platform uses Supabase-native stack, NOT Prisma/local Postgres as the BUILD_PROMPT said"
metadata: 
  node_type: memory
  type: project
  originSessionId: ca27639e-1604-4b4f-bcbf-6fe772649db9
---

The BBMP/GBA Ward & Engineer platform (D:\Tatvam\BBMP) is built per `BUILD_PROMPT.md`, BUT the user overrode the tech stack on 2026-06-14.

**Why:** User explicitly said to "maintain all DB in Supabase, Next.js" — overriding the prompt's Prisma + local Postgres + docker-compose stack.

**How to apply:**
- Data layer: `@supabase/supabase-js` + `@supabase/ssr` (NOT Prisma). Schema as SQL migrations under `supabase/migrations/`.
- Auth: Supabase Auth (email/password) with `role` in a `profiles` table, NOT NextAuth.
- Credentials in `.env`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (anon). User is adding the service-role key + Postgres `DATABASE_URL` (with password) for migrate/seed scripts.
- Runtime app reads via supabase-js (anon key + RLS); devops scripts (migrate/seed) use `pg` + `DATABASE_URL`.
- Build flow: straight through (no per-phase pauses), despite the prompt's 8-phase checkpoint instruction.

**DB connection gotcha:** Supabase direct host `db.<ref>.supabase.co` is IPv6-only — does NOT resolve on IPv4 (ENOTFOUND). Must use the **Session pooler** URI: `postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres` (region appears to be ap-south-1). Scripts use `pg` + `DATABASE_URL`; runtime uses supabase-js + anon key.

**Status as of 2026-06-14:** Full app built; typecheck/lint/build/26 tests all green. `npm run db:migrate` + `npm run db:seed` NOT yet run against live DB — blocked because the safety classifier denied an agent-reconstructed connection string. Resolution: user must paste their exact Session-pooler URI into `.env` (and add `SUPABASE_SERVICE_ROLE_KEY` for create-admin), then run migrate + seed.

See [[bbmp-data-model-facts]].
