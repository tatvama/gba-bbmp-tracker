---
name: bbmp-job-forensic-audit
description: "Phase 4 — Job-Number forensic audit engine + AI Kannada letter drafting (bill-stop/Lokayukta/RTI), safe-language gate, DOCX, MCP. Built 2026-06-17."
metadata: 
  node_type: memory
  type: project
  originSessionId: 761903a7-c435-4ef5-beab-2b7d5a6a81db
---

Phase 4 of the BBMP platform (built 2026-06-17, from the user-uploaded `bbmp-bill-audit` skill). Two modules: a job-number **forensic audit** and **advanced AI letter drafting**. See [[bbmp-mcp-and-road-work]] (earlier road-work generator + accountability features it builds on) and [[bbmp-phase3-complaints]] (complaint/document tables it reads).

**Architecture invariant:** "AI extracts/classifies; pure libs judge." Exact arithmetic is deterministic — never the model. Per-tender values (FSD %, rates, thresholds) are read from documents, never hardcoded.

**Pure forensic engines** `lib/forensics/*` (framework-free, unit-tested): `rule-engine` (ARITH split grand-total vs net-payable; EXCESS uses 5%/10% overall cap NOT 0.5%), `risk-score` (additive SEV+EVD+addon → 4 bands low/procedural/serious/bill_stop, A–E grading), `chronology`, `eligibility` (KW_CLASS_RANK), `insurance-security` (FSD never defaulted to 5%), `mb-integrity`, `royalty-salvage`, `loss-exposure` (every line "possible exposure, not proven loss"), `pattern-detector`, `gst` (date-branched, GST 2.0 = 2025-09-22), `date-parse`. Orchestrator `job-audit.ts` → `runJobAudit(input): JobAuditReport`.

**AI extractors** (server-only, env-gated) `lib/ai/forensic-extractors.ts` + `form-integrity.ts`. Action `lib/actions/job-audit.ts` `runJobAuditAction(jobNumber)`: gathers complaints by job_number + docs, AI-extracts per type, carries photo flags as PHOTO-* findings, runs engines, persists to `job_audits`. SR rates via `lib/sr-rates.ts` `loadSrRates` (paginates — PostgREST 1000-row cap).

**Letter layer** `lib/letters/*` (PURE, MCP-safe): `letter-knowledge` (7 required + 3 optional Kannada ground labels incl. ಸರಳ ಉದಾಹರಣೆ; STATUTE/RULING/RTI_RECORD maps; SAFE_REPLACEMENTS), `safe-language` (applySafeLanguage / stripKannadaDashes / lintLetter — **HARD GATE**: 8 unsafe patterns 4 EN+4 KN, identifier masks keep dashes only in job codes/GST/citations), `evidence-index`, `tables`, `evidence-block` (buildGround), `letter-skeleton` (`resolveSignatory` REFUSES Guruji/Trust), `from-findings` (BillFinding→LetterFinding mapper, shared with MCP). Prompt builders `lib/ai/letter-builder.ts` (pure). Action `lib/actions/bill-letter.ts`: `generateLetter` loads latest job_audit → maps → assembles skeleton → AI-polishes → **if lint fails the AI text is DISCARDED, deterministic baseline used** → persists to `letter_drafts`. Never auto-files.

**DOCX** `lib/docx/bill-stop-builder.ts`: A4, Kannada via `cs` complex-script font slot (NOT eastAsia), shaded ground tables, quantity chart as shaded-cell bar table. Route `app/api/job-audit/[jobNumber]/letter/route.ts` → .docx or `?format=csv`.

**UI:** `/complaints/jobs` (index), `/complaints/job/[jobNumber]/audit` (`JobAuditRunner`), `/complaints/job/[jobNumber]/letter` (`LetterDrafter` — variant/language/signatory selectors, inline lint verdict, AI-discarded banner, DOCX/CSV download). Nav "Job Forensic Audit"; complaint detail "Job-number audit" button when job_number set.

**MCP tools** (`mcp/bbmp-server.ts`): `get_job_audit(job_number)` + `draft_job_letter(...)` — tsx resolves the `@/` alias so the pure letter libs import fine.

**Signatories** (constants.ts LETTER_SIGNATORIES): raghav_gowda / sharath_babu / sai_raghav. Variants: bill_stop / lokayukta / rti / bilingual_summary.

**Migrations to run** (classifier blocks me from applying): `npm run db:migrate` for `0008_job_audit.sql` (job_audits + job_timeline_dates/eligibility/insurance/running_bills) and `0009_letter_drafts.sql`, plus `npm run db:seed-sr` for the SR rate book. ~156 tests pass (17 files); next build clean.
