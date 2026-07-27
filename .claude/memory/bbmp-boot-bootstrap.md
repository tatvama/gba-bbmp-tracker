---
name: bbmp-boot-bootstrap
description: "App self-migrates + seeds on server boot via StartupManager; requires 9 env vars incl. Cloudflare R2; SETUP_GUIDE.md is stale"
metadata:
  type: project
---

The BBMP/GBA platform runs a centralized bootstrap on every Node server start — `instrumentation.ts` → `lib/startup` (`StartupManager.run()`), nodejs runtime only (not during `next build`). Verified live 2026-07-23.

**Why:** DB schema/data and storage are provisioned by the running app, not by the manual steps in SETUP_GUIDE.md. Knowing this prevents dangerous/redundant manual DB ops against the live Supabase project.

**How to apply:**
- On boot it: validates env (critical, hard-fails) → verifies DB connectivity → **auto-applies pending SQL migrations** from `supabase/migrations/` (idempotent, tracked) → seeds (idempotent) → verifies Storage buckets → health-checks DB/R2/AI → starts background sweepers (escalation ladder 20m, job sweeper 2m).
- So do NOT manually run `db:migrate`/`db:seed`/`db:reset` against the live DB to "set up" — just boot the app (`npm run dev`). Manual seeding risks duplicate rows; `db:reset` is destructive. The sweepers WRITE to prod on their intervals, so don't leave `dev`/`start` running unattended against production.
- Required env or boot throws (`lib/startup/environment.ts`, `critical=true`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, and 5 Cloudflare **R2** vars (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`). Optional (warn only): `ANTHROPIC_API_KEY`, `CRON_SECRET`.
- SETUP_GUIDE.md is **stale**: it never mentions R2 (now the primary document store, required) and its manual migrate/seed/storage steps are superseded by the boot bootstrap.
- The user's real filled-in `.env` lives at the main working-tree root `D:\priyanka\gba-bbmp-tracker\.env` (copy it into a worktree to run there; it's gitignored).

See [[bbmp-stack-override]], [[bbmp-data-model-facts]].
