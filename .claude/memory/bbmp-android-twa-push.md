---
name: bbmp-android-twa-push
description: "Android app is a Trusted Web Activity shell — deploying the web app IS shipping the app update; plus Web Push, the signing keystore, and the RLS-from-cron digest fix"
metadata:
  node_type: memory
  type: project
---

The platform ships an Android app as of 2026-08-04: `android-twa/`, a ~1 MB
**Trusted Web Activity** that opens `https://rti.taatvam.com` full-screen inside
Chrome with its own launcher icon and no browser UI. Built with Bubblewrap,
package `com.taatvam.rti`, distributed as a signed APK from `/app` (no Play
Store). Detailed doc: [`MOBILE_APP_ARCHITECTURE.md`](../../MOBILE_APP_ARCHITECTURE.md).

**Why a TWA and not Capacitor:** the app cannot be bundled offline (SSR +
Supabase + server actions + server-side OCR/PDF), so the APK had to be a shell
around the live site — which is also what makes updates automatic. A plain
Capacitor WebView was rejected because it **silently breaks two things this app
depends on**: `blob:` + `a.download` saves (9 components generate PDF/DOCX/XLSX
client-side, e.g. `components/rti/ai-draft-panel.tsx`) and live `getUserMedia`
scanning (`components/complaints/scan-capture.tsx`,
`components/rti/document-capture.tsx`). A TWA *is* Chrome, so both work
untouched, as do file pickers and Web Push.

**How to apply:**

- **Do not rebuild the APK for app changes.** It contains no app code. Deploying
  the web app *is* shipping the Android update — it appears on every phone at the
  next screen load. Rebuild only for: app name, launcher icon, splash colours,
  package id, or a targetSdk bump.
- **The signing keystore lives OUTSIDE the repo**, at
  `D:\gba-bbmp-tracker\secrets\gba-twa.keystore` (password beside it). Losing it
  means no installed app can ever be updated again — users would have to
  uninstall/reinstall under a new package name. Not recoverable by anyone.
- `public/.well-known/assetlinks.json` pins that key's SHA-256. Chrome fetches it
  on launch; **on a match it drops the URL bar, otherwise the app works but looks
  like a browser.** Change the key ⇒ update that file and redeploy. Current
  fingerprint starts `94:90:41:7E:…`.
- New web-side pieces: `app/manifest.ts` (`/manifest.webmanifest` — Bubblewrap
  reads this to generate the APK), `public/sw.js`, `public/icons/*` via
  `npm run icons:gen`, and the public install page `app/app/page.tsx` (`/app`).
- **`public/sw.js` must never cache HTML or RSC payloads.** It is network-only
  with a precached static `offline.html` fallback. Caching documents would serve
  a stale app and destroy the live-update guarantee that is the entire point.
- Release: `./gradlew assembleRelease` → zipalign → apksigner → `npm run apk:publish`
  (uploads a versioned APK + `app/latest.json` pointer to R2; `/app` resolves the
  pointer at request time, so publishing a build needs no redeploy).

**Web Push targets STAFF, not the officers.** The overdue-alert *email* digest is
addressed to external BBMP/GBA officers derived from `letter_emails.recipients`
(see the header of `lib/complaints/overdue-alert-scheduler.ts`). Those officers
are not app users and have no browser subscription, so push cannot mirror it.
Push mirrors what the notifications bell shows staff. Table
`push_subscriptions` (migration **0052**, owner-only RLS, one row per device);
sender `lib/push/send.ts`; opt-in `components/nav/push-toggle.tsx`. VAPID keys are
optional — unset, push is inert and email/webhook are unaffected; setting only
one of the two is warned about at boot (`lib/startup/environment.ts`).

`lib/push/send.ts` lives under the **same import-site rule as `lib/mail/*`**:
request-triggered code only, never anything reachable from `instrumentation.ts` →
`lib/startup/jobs.ts`. Its only caller is `app/api/cron/notifications/route.ts`.

**Bug fixed on the way (real numbers):** that cron route called
`getNotificationDigest()` with the cookie-scoped client. Cron has no session, and
`reminders` / `job_audits` are **not anon-readable** — RLS returns denial as
*empty rows, not an error*, so it looked successful while reporting
`dueReminders: 0, highRiskAudits: 0` when the truth was **5 and 2**, both
suppressed audits in the `bill_stop` band. It now passes the service-role client.
The general trap: any session-less caller of `lib/queries.ts` must pass the admin
client explicitly, because RLS failure there is silent.

**Local-machine gotchas** (neither is a code problem):
- Norton intercepts TLS and re-signs everything with its own root, which Windows
  trusts but the JDK does not — every Gradle/Maven download fails with
  `PKIX path building failed`. Fixed without importing any cert via
  `-Djavax.net.ssl.trustStoreType=Windows-ROOT` (set in
  `android-twa/gradle.properties` and needed as `GRADLE_OPTS` for the wrapper's
  own download).
- `bubblewrap build` does not work here: it requires an old SDK layout
  (`tools/` or `bin/` at the SDK root) and pins build-tools `36.1.0`. Use
  `bubblewrap update` for generation and **Gradle directly** for the build.
- See [[napi-canvas-blocked-locally]] for the intermittent `@napi-rs/canvas`
  Application Control block that makes local login/build/test failures look like
  code bugs.

Note on [[bbmp-boot-bootstrap]]: migration 0052 was applied by a manual
`npm run db:migrate` against the live DB to test push end-to-end. That is the
same tracked, idempotent step the boot bootstrap performs, so it only happened
earlier than it otherwise would have — the "don't manually migrate" caution is
really about seeding and `db:reset`.

See [[bbmp-boot-bootstrap]], [[bbmp-mcp-and-road-work]], [[bbmp-phase3-complaints]].
