---
name: bbmp-phase3-complaints
description: "Phase 3 Complaint Management (documents, OCR, AI) — built & verified; key decisions"
metadata: 
  node_type: memory
  type: project
  originSessionId: 761903a7-c435-4ef5-beab-2b7d5a6a81db
---

Phase 3 ("Advanced Complaint Management System with mobile upload, OCR, AI summary, case numbers, reply/action tracking, follow-up reminders") is **complete and verified** as of 2026-06-14, built Supabase-native on the existing stack ([[bbmp-stack-override]], [[bbmp-phase2-rti]]).

**Key decisions / facts:**
- Adapted the spec's "Prisma" instructions to **raw SQL + lib/types + server actions** (no Prisma), and **reused the tables migration 0003 created** (communication_logs, escalation_logs, ai_drafts, reminders, templates) rather than duplicating — 0004 only adds deltas.
- Migration `supabase/migrations/0004_complaints.sql`: extends `complaints` (reuses title/type/date_submitted/complaint_number/status; adds internal_case_number, assigned_engineer/officer_id, division/corporation_id, latest_reply/action_*, closure, deleted_at), **widens type/status CHECK + migrates legacy lowercase/UPPER values to Title Case** (constants COMPLAINT_TYPES/STATUSES changed accordingly — the old complaint UI now uses the new vocab), new tables complaint_documents/complaint_timeline/complaint_replies/complaint_action_taken/ocr_jobs, ALTERs communication_logs (+officer_id/phone_or_email/next_action_date/document_id) and reminders (+reminder_type), and `next_complaint_case_number(prefix,year)` SECURITY DEFINER fn (→ DM-CMP-2026-000001).
- **Storage**: private buckets (complaint-documents/evidence/processed-images/exports) created by `npm run db:setup-storage` (uploads self-heal via ensureBucket). All storage + complaint writes use the **service-role admin client AFTER app-level requireRole** (supports Field Officer/Verifier without RLS friction); service key never reaches client; viewing via signed URLs.
- **OCR**: sharp preprocess + tesseract.js (eng+kan→eng fallback), pluggable provider + paid placeholders, `lib/ocr/process-document.ts` orchestration + ocr_jobs. PDF OCR is a documented placeholder (not implemented). **OCR failure never breaks upload.**
- **AI**: `lib/ai/complaint-document-analyzer.ts` structured extraction + draft builders, env-gated (works without ANTHROPIC_API_KEY), **never auto-applies** — human review screen (`applyDocumentExtraction`) approves before updating the complaint.
- Roles: Field Officer uploads/notes, Complaint Manager CRUD+approve, Verifier verifies OCR/AI, only Admin/Complaint Manager delete (soft-delete via deleted_at — **all read queries must filter `.is('deleted_at', null)`**).
- New scripts: `db:setup-storage`, `db:seed-complaints` (5 sample complaints DM-CMP-2026-9000xx + 10 templates); both in `db:reset`.

**Verification:** typecheck/lint clean, 51 tests pass, migration applied, buckets created, seed OK, browser-verified (list/dashboard/detail tabs/gating). An **adversarial review workflow** (13 agents) found 6 real issues — all fixed: missing `deleted_at` filters in listComplaintsForWard + globalSearch + edit page; unchecked case-number RPC error in createComplaint; missing audit in completeComplaintReminder. Also fixed a TanStack stale default-sort column (`updated_at`→`date_submitted`) found in browser console.

**Deferred (documented):** PDF-to-image OCR, paid OCR providers (placeholders), full template-management admin UI (templates seeded + used).
