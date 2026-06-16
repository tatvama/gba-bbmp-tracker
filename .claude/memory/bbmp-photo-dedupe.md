---
name: bbmp-photo-dedupe
description: Duplicate-photo detection — same image reused across job numbers/roads within a division (anti-fraud)
metadata: 
  node_type: memory
  type: project
  originSessionId: 761903a7-c435-4ef5-beab-2b7d5a6a81db
---

Built 2026-06-15 (commit a200c03). Detects the contractor fraud of reusing the same Before/During/After photo (or scan) across different roads/job numbers, **typically within one engineering division** (same contractor + AE/AEE/EE). Findings are framed as **suspicions for human review, never automated accusations** (aligns with the `bbmp-bill-audit` skill ethos). See [[bbmp-mcp-and-road-work]] (officer accountability is reused here).

**Three signals** (combine for accuracy): SHA-256 (byte-identical), perceptual **pHash (32×32 DCT) + dHash (9×8)** (resized/recompressed/cropped — require BOTH Hamming ≤ thresholds), and **EXIF GPS+timestamp** (corroborating; many shared photos strip EXIF so perceptual is the backbone). Severity: High = SHA exact / strict perceptual (≤6) / GPS+time identical; Medium = perceptual near; Low = GPS-only.

**Key files:**
- `supabase/migrations/0005_photo_dedupe.sql` — `complaints.job_number`; `complaint_documents`: file_sha256, **phash/dhash as hex TEXT (16 chars), NOT bigint** (PostgREST returns bigint as JS number → 64-bit precision loss), exif_gps_lat/lon, exif_taken_at, photo_stage, is_duplicate, dup_severity, dup_matches jsonb, dup_checked_at; + `app_settings` key `photo_dedupe_rules`.
- `lib/ocr/image-fingerprint.ts` — **framework-free (NO `server-only`)** so the upload route AND the tsx backfill script share IDENTICAL hashing (else backfilled hashes wouldn't match). Exports sha256, dhash, phash, fingerprintImage, hammingHex. Inlines its own isImageMime (doesn't import image-preprocess, which IS server-only).
- `lib/dedupe-photos.ts` (server-only, admin client) — findPhotoMatches (cross job/case only, division-aware, `sameDivision` flag), runDuplicatePhotoAudit (union-find clusters, grouped by division, same-division-first, FETCH_CAP 4000 + O(n²) perceptual), getDivisionResponsibleOfficers (AE/AEE/EE by `division_id`+`role_level`).
- `lib/settings.ts` getPhotoDedupeRules; `lib/constants.ts` DEFAULT_PHOTO_DEDUPE_RULES.
- Upload route `app/api/complaints/[id]/documents/upload/route.ts`: fingerprints on upload, flags verification_status=Duplicate + dup_matches, returns `duplicateWarning`; OCR `process-document.ts` backfills fingerprints on re-run.
- `scripts/backfill-fingerprints.ts` (`npm run db:backfill-fingerprints`) — self-contained supabase client (can't import server-only libs under tsx), imports only fingerprintImage; backfills + flags exact-SHA cross-case dupes.
- UI: `/complaints/duplicates` (audit, role COMPLAINT_VERIFY_ROLES, thumbnails via getSignedUrl, division breakdown + responsible officers); upload warning banner in `document-upload.tsx`; Duplicate badge in `document-list.tsx`; nav "Duplicate Photos".
- Forms: `job_number` added to complaint-form + validators `complaintSchema.jobNumber` + complaints `toRow` + road-work generator approve path.

**Gotchas:** (1) `server-only` is NOT resolvable under `tsx` ("Cannot find package") — scripts must avoid importing any server-only module; that's why image-fingerprint dropped the guard. (2) `noUncheckedIndexedAccess` is ON — typed-array (Buffer) and array reads are `T|undefined`; guard with `?? 0` / `!`. (3) Internal links must use `next/link` (no `<a href="/...">` — `@next/next/no-html-link-for-pages` is an ERROR). (4) **Migration must be run before uploads work** — the upload insert references the new columns; the auto-classifier blocks the agent from running `db:migrate` on the live DB, so the USER runs `npm run db:migrate` + `npm run db:backfill-fingerprints`.

Verified: typecheck 0, lint 0, 60 tests (9 new fingerprint tests: identical→Ham 0, re-encoded→≤10, horizontal-vs-vertical gradient→>10), /complaints/duplicates serves 200 (defensive — returns [] pre-migration). Pushed to GitHub main.
