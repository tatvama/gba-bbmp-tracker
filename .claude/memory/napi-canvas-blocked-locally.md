---
name: napi-canvas-blocked-locally
description: "@napi-rs/canvas's native binding is intermittently blocked by Windows Application Control, making local login/build/test failures look like code bugs"
metadata:
  node_type: memory
  type: project
---

On the Windows dev box, `@napi-rs/canvas`'s native binding
(`node_modules/@napi-rs/canvas-win32-x64-msvc/skia.win32-x64-msvc.node`) is
sometimes refused by Windows Application Control:

```
ERR_DLOPEN_FAILED: An Application Control policy has blocked this file.
```

It usually surfaces behind a misleading wrapper message — *"Cannot find native
binding. npm has a bug related to optional dependencies… try `npm i` again after
removing package-lock.json and node_modules"* — which sends you chasing a
dependency problem that does not exist. **Do not delete `node_modules`.**

Observed 2026-08-03/04, and it is **intermittent**: the same commands failed, then
later succeeded with no code change.

**Why it matters:** the failures land in places that look unrelated to image
rendering, because the import chain reaches canvas through
`lib/pdf/pdf-renderer.ts` and the OCR modules.

**How to apply** — these three symptoms are environmental, not bugs:

- `POST /login` returns **500** under `npm run dev` (the login server action's
  graph pulls in `pdf-renderer` → canvas).
- `npm run build` dies at **"Collecting page data"** on
  `/api/complaints/documents/[documentId]/analyze`.
- These 3 test files fail (8 tests): `ack-import-r2-cleanup`,
  `complaints-soft-delete`, `jobs-sweep-reclaim`.

Check whether the error mentions `skia` / `ERR_DLOPEN_FAILED`; if so, just retry.
To confirm it is not your change, `git stash` and re-run — if it fails
identically without your edits, it is the policy.

`sharp` is unaffected and is the better choice for image work in scripts —
`scripts/gen-app-icons.ts` uses sharp deliberately for this reason (it also
avoids librsvg's inability to resolve the `system-ui` font keyword, which would
silently render the launcher icons as blank blue squares).

Unrelated but the same class of local-only obstacle: Norton intercepts TLS, so
JVM/Gradle builds need `-Djavax.net.ssl.trustStoreType=Windows-ROOT` — see
[[bbmp-android-twa-push]] and `android-twa/README.md`.
