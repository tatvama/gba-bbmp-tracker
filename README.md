# GBA · BBMP Ward & Engineer Tracker

A full-stack civic accountability platform for Bengaluru — tracking ward restructuring, engineering contacts, RTI applications, and complaint management across the **Greater Bengaluru Authority (GBA)** 198 → 225 → 369 ward transition.

> **Status:** Production-ready · Phase 1 + 2 + 3 complete · Zero typecheck/lint errors · 51 tests pass

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Features by Phase](#features-by-phase)
4. [Project Structure](#project-structure)
5. [Quick Start](#quick-start)
6. [Environment Variables](#environment-variables)
7. [Database](#database)
8. [Seeding Data](#seeding-data)
9. [User Roles & Access](#user-roles--access)
10. [Phase 1 — Ward & Engineer Tracker](#phase-1--ward--engineer-tracker)
11. [Phase 2 — RTI Module](#phase-2--rti-module)
12. [Phase 3 — Complaint Management](#phase-3--complaint-management)
13. [Storage Setup](#storage-setup)
14. [AI Configuration](#ai-configuration)
15. [OCR Pipeline](#ocr-pipeline)
16. [API Reference](#api-reference)
17. [Deployment](#deployment)
18. [Development Guide](#development-guide)

---

## Overview

| Domain | What it does |
|--------|-------------|
| **Ward Tracker** | Maps every locality across 198 → 225 → 369 ward restructures; links wards to corporations, divisions, sub-divisions, and engineers |
| **RTI Module** | Full RTI lifecycle — draft, file, track deadlines, first/second appeals, AI-assisted drafting, reply analysis |
| **Complaint Management** | End-to-end complaint tracking with internal case numbers, mobile upload, server-side OCR, AI extraction (human-review mandatory), reply/action/escalation logs |

All data lives in **Supabase (PostgreSQL)** with Row-Level Security. Auth is Supabase Auth with a `profiles.role` column. No Prisma — raw SQL migrations applied via `scripts/migrate.ts`.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, React 19) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS + shadcn/ui |
| Database | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth + `profiles.role` |
| Tables | TanStack Table v8 |
| Forms | Native `useActionState` + Zod |
| AI | Anthropic Claude (env-gated) |
| OCR | Tesseract.js (eng+kan) + sharp |
| Storage | Supabase Storage (private buckets) |
| Export | SheetJS (CSV + XLSX) |
| Tests | Vitest |

---

## Features by Phase

### Phase 1 — Ward & Engineer Tracker
- 225-ward BBMP master list with full lineage (old-198 → new-225 → GBA-369)
- Corporation → Division → Engineering Sub-Division → Ward hierarchy
- Contact directory with verification badges and confidence scores
- Interactive Tree Map (`/explorer`) for geographic ward exploration
- Global ⌘K command palette
- CSV/XLSX export on every table
- Contact import (CSV/JSON) with preview validation

### Phase 2 — RTI Module
- Full lifecycle: Draft → Filed → Awaiting Reply → Reply Received → First Appeal → Second Appeal → Closed
- Configurable statutory deadlines (30d normal / 48h life-liberty / 30d first appeal / 90d second appeal)
- Live countdown badges: overdue · due-today · due-soon · on-track
- AI-assisted drafting (editable drafts only — never auto-files anything)
- Reply analyzer: AI classifies each question as Answered / Partial / Denied / Irrelevant
- First appeal and second appeal generators
- RTI calendar view, reminder system, templates

### Phase 3 — Advanced Complaint Management
- Internal case numbers (`DM-CMP-YYYY-000001`) via atomic Postgres function
- Mobile-first document upload with camera capture
- Server-side OCR: sharp preprocessing → Tesseract.js — OCR failure never blocks upload
- AI document extraction with **mandatory human review** screen before applying
- 10-tab detail view: Overview · Documents · Timeline · Replies · Action Taken · Communications · Follow-ups · Escalations · AI Drafts · Audit
- Soft-delete with `deleted_at` filtering on every query
- Complaint dashboard with 12 stat counters
- Mobile field officer pages, reports, OCR queue monitor

---

## Project Structure

```
├── app/
│   ├── page.tsx                  # Main dashboard
│   ├── layout.tsx                # Root layout (sidebar + topnav)
│   ├── complaints/               # Complaint management
│   │   ├── page.tsx              # Complaint list (TanStack table)
│   │   ├── dashboard/            # Stats dashboard
│   │   ├── [id]/                 # Detail (10 tabs), edit, print
│   │   ├── mobile/               # Field officer quick pages
│   │   ├── reports/              # Pending, overdue, by type
│   │   ├── ocr-queue/            # OCR job monitor
│   │   └── settings/             # Complaint config
│   ├── rti/                      # RTI module
│   │   ├── page.tsx              # RTI dashboard
│   │   ├── all/                  # RTI list
│   │   ├── new/                  # 10-step wizard
│   │   ├── [id]/                 # Detail, edit, appeals, analyze
│   │   ├── calendar/             # Deadline calendar
│   │   ├── reports/              # RTI reports
│   │   └── settings/             # Deadline rule config
│   ├── wards/ contacts/ corporations/ divisions/ sub-divisions/
│   ├── explorer/                 # Interactive Tree Map
│   ├── reports/                  # Cross-entity reports
│   ├── search/                   # Global search
│   └── api/complaints/           # Upload, OCR, AI API routes
│
├── components/
│   ├── ui/                       # shadcn/ui primitives
│   ├── nav/                      # Sidebar, topnav, command palette
│   ├── complaints/               # Complaint-specific components
│   ├── rti/                      # RTI-specific components
│   └── *.tsx                     # Shared: PageHeader, DetailRow, EmptyState
│
├── lib/
│   ├── actions/                  # Server actions (auth-gated mutations)
│   ├── ai/                       # AI provider + prompt builders
│   ├── ocr/                      # OCR pipeline (preprocess → tesseract → orchestrate)
│   ├── storage/                  # Supabase Storage (upload, signed URL, self-heal)
│   ├── auth.ts                   # getSessionUser, hasRole, requireRole
│   ├── audit.ts                  # writeAudit, diffFields
│   ├── constants.ts              # All enums, roles, bucket names
│   ├── queries.ts                # All DB reads
│   ├── rti-deadlines.ts          # Pure deadline math (tested)
│   ├── settings.ts               # app_settings reader
│   ├── types.ts                  # TypeScript interfaces
│   └── validators.ts             # Zod schemas
│
├── supabase/migrations/
│   ├── 0001_init.sql             # Base schema + RLS + triggers
│   ├── 0002_wards_gba.sql        # GBA 369-ward table
│   ├── 0003_phase2.sql           # RTI + officer hierarchy + reminders + AI drafts
│   └── 0004_complaints.sql       # Advanced complaint schema (Phase 3)
│
└── scripts/
    ├── migrate.ts                # Migration runner
    ├── seed.ts                   # Core data (wards, corps, divisions)
    ├── seed-rti.ts               # RTI sample data + templates
    ├── seed-complaints.ts        # Complaint sample data
    └── setup-storage.ts          # Create Supabase Storage buckets
```

---

## Quick Start

### Prerequisites
- Node.js 20+
- A [Supabase](https://supabase.com) project

### 1. Clone & install

```bash
git clone https://github.com/YOUR_ORG/gba-bbmp-tracker.git
cd gba-bbmp-tracker
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
# Fill in all values — see Environment Variables section
```

### 3. Initialize database

```bash
npm run db:migrate          # Apply all SQL migrations
npm run db:seed             # Core: wards, corporations, divisions
npm run db:seed-rti         # RTI sample data + deadline rules
npm run db:seed-complaints  # Complaint sample data
npm run db:setup-storage    # Create 4 private Storage buckets
```

Or all at once:
```bash
npm run db:reset
```

### 4. Start

```bash
npm run dev    # http://localhost:3000
```

### 5. First admin

1. Sign up at `/login`
2. In Supabase Dashboard → Table Editor → `profiles` → set your row's `role` to `ADMIN`
3. Reload — full access unlocked

---

## Environment Variables

Create `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...          # Server-only — never expose to client

# Database (for migration runner)
DATABASE_URL=postgresql://postgres:PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres

# AI (optional — app works fully without this)
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...             # console.anthropic.com
AI_MODEL=claude-sonnet-4-6               # or claude-opus-4-8, claude-haiku-4-5
AI_TEMPERATURE=0.3

# App
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

> `SUPABASE_SERVICE_ROLE_KEY` is used server-side only — always after `requireRole()` authorization check. It is never sent to the browser.

---

## Database

### Migrations

```bash
npm run db:migrate    # idempotent — safe to re-run
```

Migrations in `supabase/migrations/` are applied in filename order via `scripts/migrate.ts` using a raw `pg` client. All files use `IF NOT EXISTS` / `DROP POLICY IF EXISTS` — safe to re-run.

### Migration files

| File | What it creates |
|------|----------------|
| `0001_init.sql` | `wards`, `corporations`, `divisions`, `eng_subdivisions`, `contacts`, `complaints` (basic), `profiles`, `audit_logs`, RLS, `set_updated_at` trigger |
| `0002_wards_gba.sql` | `gba_wards` with Kannada→English names |
| `0003_phase2.sql` | `rti_applications`, `rti_first_appeals`, `rti_second_appeals`, `reminders`, `communication_logs`, `escalation_logs`, `ai_drafts`, `templates`, `app_settings`, officer columns on `contacts` |
| `0004_complaints.sql` | Extended `complaints` schema, `complaint_documents`, `complaint_timeline`, `complaint_replies`, `complaint_action_taken`, `ocr_jobs`, `complaint_counters`, `next_complaint_case_number()` function |

### Key tables

```
profiles               -- Supabase Auth extension (role, full_name)
corporations           -- 5 GBA corporations
divisions              -- BBMP divisions (30)
eng_subdivisions       -- Engineering sub-divisions (75)
wards                  -- 225 BBMP wards with lineage
gba_wards              -- GBA 369 wards (Kannada/English)
contacts               -- Engineers and officers
complaints             -- Civic complaints
complaint_documents    -- Uploaded files with OCR/AI state
complaint_timeline     -- Immutable event log
complaint_replies      -- Reply records
complaint_action_taken -- Action taken records
ocr_jobs               -- OCR processing queue
rti_applications       -- RTI filings
rti_first_appeals      -- First appeals
rti_second_appeals     -- Second appeals
reminders              -- Polymorphic (entity_type / entity_id)
communication_logs     -- Polymorphic comms log
escalation_logs        -- Escalation chain
ai_drafts              -- Saved AI-generated drafts
templates              -- RTI/complaint templates
app_settings           -- Configurable settings (key/value JSONB)
audit_logs             -- Immutable field-level change log
```

---

## Seeding Data

| Script | Seeds |
|--------|-------|
| `npm run db:seed` | 225 wards, 5 corps, 30 divisions, 75 sub-divs, sample contacts |
| `npm run db:seed-rti` | 5 sample RTIs, 2 appeals, default deadline rules, 15+ templates |
| `npm run db:seed-complaints` | 5 sample complaints (`DM-CMP-2026-9000xx`), 10 templates |

All sample rows are tagged `SAMPLE-` and the scripts are idempotent (delete + re-insert).

---

## User Roles & Access

Roles stored in `profiles.role`. RLS enforced by `can_write()` and `can_verify()` Postgres functions.

| Role | Access |
|------|--------|
| `VIEWER` | Read-only across all data |
| `EDITOR` | Create/update contacts, complaints, RTIs |
| `VERIFIER` | EDITOR + verify contacts and OCR extractions |
| `RTI_MANAGER` | EDITOR + RTI-specific writes |
| `COMPLAINT_MANAGER` | EDITOR + complaint writes, approve AI extractions, delete |
| `FIELD_OFFICER` | Upload documents, add field notes, create quick complaints |
| `ADMIN` | Full access including settings and delete |

---

## Phase 1 — Ward & Engineer Tracker

### Ward lookup

`/wards` → search by name, AC, zone, or corporation → click a ward for full lineage, sub-division, and linked engineers.

### Corporations hierarchy

`/corporations` → `/divisions` → `/sub-divisions` — drill down from GBA corporation level to the specific engineering unit responsible for a street.

### Contact directory

`/contacts` — every engineer and officer with:
- Verification badge (Verified / Pending / Needs Correction / Retired/Transferred)
- Confidence score (High / Medium / Low)
- Source provenance (import file, manual, PDF scan)
- Edit form with full audit history

### Tree Map

`/explorer` — zoomable treemap of all wards grouped by corporation. Color-coded by verification density.

### Global search

Press `⌘K` (or click the search bar) to search wards, contacts, divisions, complaints, RTIs in real-time. Navigates directly on selection.

---

## Phase 2 — RTI Module

### Creating an RTI

Go to `/rti/new` — 10-step wizard:
1. Ward / department / PIO details
2. Category (Road / Water / Drain / Tender / etc.)
3. Facts and information requested
4. Template question picker
5. AI draft generation *(requires `ANTHROPIC_API_KEY`)*
6. Edit the draft
7. Preview final text
8. Save draft or mark as Filed
9. Postal / online submission details
10. Confirmation + case ID

### Deadline engine (`lib/rti-deadlines.ts`)

Pure function — fully unit-tested:

| Deadline | Default | Admin-configurable |
|----------|---------|-------------------|
| Normal reply | 30 days from filing | ✓ in `/rti/settings` |
| Life & liberty | 48 hours | ✓ |
| First appeal | 30 days from reply due | ✓ |
| FAA decision | 45 days | ✓ |
| Second appeal | 90 days from first appeal | ✓ |

Rules persisted in `app_settings.rti_deadline_rules`.

### Deadline badges

| Color | Meaning |
|-------|---------|
| 🟢 On track | > 10 days remaining |
| 🟡 Due soon | 1–10 days |
| 🔴 Due today | 0 days |
| 🔴 Overdue | 1–30 days past |
| ⚫ Critical | > 30 days past |

### AI drafting (RTI)

1. Open RTI → **First Appeal** or **Second Appeal**
2. Select grounds and legal tone (formal / assertive / conciliatory)
3. Click **Generate** → Claude drafts the letter
4. Always editable, always shown with "**Review before filing**" banner
5. Save → stored in `ai_drafts`, never auto-filed

### Reply analyzer

RTI detail → **Analyze Reply** → paste authority's reply → Claude returns per-question table:
- Status: Answered / Partial / Not Answered / Denied / Irrelevant / Needs Clarification
- Suggested appeal ground for each unanswered point

---

## Phase 3 — Complaint Management

### Case numbers

Every complaint gets an atomic case number via `next_complaint_case_number(prefix, year)` — a `SECURITY DEFINER` Postgres function using `complaint_counters` with `FOR UPDATE`:

```
DM-CMP-2026-000001
DM-CMP-2026-000002
```

Prefix configurable in `/complaints/settings`.

### Creating a complaint

- **Web full form:** `/complaints/new`
- **Mobile quick-add:** `/complaints/mobile/new` (minimal fields, phone-optimized)

### Document upload

Open complaint → **Documents & OCR** tab:

| Button | Action |
|--------|--------|
| **Upload & OCR** | Upload + trigger OCR on completion |
| **Upload without OCR** | Store only, skip OCR |
| **Add as evidence photo** | Camera capture (`capture="environment"`), no OCR |

**Server-side upload flow:**
```
POST /api/complaints/[id]/documents/upload
  → requireRole(COMPLAINT_WRITE_ROLES)
  → validateUpload(mime, size)           # server-side — not client
  → uploadBuffer() → Supabase Storage (private bucket)
  → INSERT complaint_documents
  → writeAudit + addTimeline
  → OCR triggered (best-effort — failure never returns 500)
```

### OCR pipeline

```
document (status: pending)
  → downloadBuffer() from Storage
  → sharp preprocess:
       auto-rotate (EXIF) → resize ≤2200px → grayscale
       → normalize → sharpen → PNG
  → Tesseract.js recognize (eng+kan, fallback: eng)
  → cleanOcrText() — normalize whitespace
  → Upload processed image + thumbnail to Storage
  → UPDATE complaint_documents (ocr_text, confidence, status)
  → UPDATE ocr_jobs
```

- **PDF files** → `status: Skipped` (PDF-to-image is a documented placeholder)
- **Any error** → `status: Failed` — the original upload is unaffected
- **Never throws** — wraps all operations defensively

### AI extraction with human review

```
POST /api/complaints/documents/[documentId]/analyze
  → Fetch document + complaint context
  → analyzeComplaintDocument() → Anthropic API
  → Returns structured JSON:
     { complaint_type, priority, location, description,
       suggested_reply, suggested_action, confidence }
  → UPDATE complaint_documents (ai_extracted_json, ai_status: pending_review)
```

**The `DocumentReview` component** shows a diff of proposed changes with a red "Review before applying" banner. Clicking **Apply** calls `applyDocumentExtraction` which:
1. Updates only non-null complaint fields
2. Optionally creates reply/action records
3. Marks document as `Verified`
4. Creates a follow-up reminder
5. Writes full audit log

**AI is never auto-applied.** This is enforced in the UI and the server action.

### 10-tab complaint detail

| Tab | Contents |
|-----|---------|
| **Overview** | Two-column detail grid of all complaint fields |
| **Documents & OCR** | File list, OCR text, AI extraction, review panel |
| **Timeline** | Immutable chronological event log |
| **Replies** | Reply records (date, summary, document link) |
| **Action Taken** | Action records with completion tracking |
| **Communications** | Phone/email/visit log with next-action date |
| **Follow-ups** | Reminder list with due dates and completion |
| **Escalations** | Escalation chain with officer and order details |
| **AI Drafts** | Generate / save / print 7 draft types |
| **Audit** | Field-level change log with user and timestamp |

### Soft-delete

Deletion sets `deleted_at = NOW()`. All read queries MUST filter:
```typescript
.is("deleted_at", null)
```
Enforced in: `listComplaints`, `getComplaint`, `listComplaintsForWard`, `globalSearch`, `complaintDashboardStats`, edit page.

### AI draft types (complaint)

| Kind | Purpose |
|------|---------|
| Reply | Draft an official reply to the complainant |
| Notice | Legal notice to the responsible party |
| Inspection Report | Site inspection findings |
| Action Report | Action taken summary |
| Escalation | Escalation to senior officer |
| Closure | Case closure summary |
| Follow-up | Follow-up reminder letter |

---

## Storage Setup

Four **private** Supabase Storage buckets (no public access):

| Bucket | Purpose |
|--------|---------|
| `complaint-documents` | Original uploaded files |
| `complaint-evidence` | Evidence / site photos |
| `complaint-processed-images` | OCR-preprocessed images + thumbnails |
| `complaint-exports` | Generated exports |

All viewing uses **signed URLs** (60-minute default expiry). Service-role key used server-side only.

```bash
npm run db:setup-storage
```

If a bucket is missing at upload time, `ensureBucket()` auto-creates it (self-healing).

---

## AI Configuration

The AI layer is **fully optional** — every AI feature degrades gracefully:
- No `ANTHROPIC_API_KEY` → buttons show "AI not configured", manual templates still work
- All output is editable before use
- Nothing auto-files, auto-sends, or auto-updates

### Setup

```env
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-sonnet-4-6      # recommended
AI_TEMPERATURE=0.3
```

### AI safety rules (enforced in system prompts)

1. All output is a **draft** — never applied automatically
2. Every draft shows "Review before filing / applying"
3. Language uses "it appears", "kindly provide records", "as per RTI Act 2005"
4. **Placeholders** for missing facts — never invents names, dates, or amounts
5. No unsupported allegations
6. Cites internal source records only

### AI features map

| Feature | Page | Server action |
|---------|------|--------------|
| RTI application draft | `/rti/new` step 5 | `generateRtiDraft` |
| First / second appeal | `/rti/[id]/first-appeal` | `generateRtiDraft` |
| Reply analyzer | `/rti/[id]/analyze` | `analyzeRtiReply` |
| Document extraction | Complaint Documents tab | `analyzeDocumentById` |
| Complaint draft (7 kinds) | Complaint AI Drafts tab | `buildComplaintDraftPrompt` |

---

## OCR Pipeline

### Preprocessing (sharp)

```typescript
sharp(buffer)
  .rotate()                                          // EXIF auto-rotation
  .resize(2200, 2200, { fit: "inside",
                         withoutEnlargement: true }) // max 2200px
  .grayscale()
  .normalize()                                       // stretch contrast
  .sharpen()
  .png()
  .toBuffer()
```

### Language

Tesseract.js runs `eng+kan` by default. Falls back to `eng` if the combined model fails.

### Pluggable provider

```typescript
interface OCRProvider {
  recognize(input: Buffer): Promise<{ text: string; confidence: number }>;
}
```

Google Vision / AWS Textract can be plugged in by implementing this interface. Stubs are in `lib/ocr/`.

### OCR Queue

`/complaints/ocr-queue` — admin view of all jobs: status, confidence, error messages, re-run button.

---

## API Reference

All mutations go through **Next.js Server Actions**. Only document upload needs an API route (multipart form data).

### `POST /api/complaints/[id]/documents/upload`

Upload a file to a complaint.

```
Content-Type: multipart/form-data
Body: file (binary)
Auth: Cookie session (COMPLAINT_WRITE_ROLES)

Response 200:
{
  "ok": true,
  "documentId": "uuid",
  "ocrStatus": "pending | Failed | Skipped",
  "aiConfigured": true | false
}

Response 401: { "error": "Unauthorized" }
Response 400: { "error": "No file provided" | "File too large" | "Invalid file type" }
```

### `POST /api/complaints/documents/[documentId]/run-ocr`

Trigger or re-trigger OCR on an uploaded document.

```
Auth: Cookie session (COMPLAINT_WRITE_ROLES)

Response 200:
{ "ok": true, "status": "completed | failed | skipped" }
```

### `POST /api/complaints/documents/[documentId]/analyze`

Run AI extraction on an OCR'd document.

```
Auth: Cookie session (COMPLAINT_WRITE_ROLES)

Response 200:
{ "ok": true, "extraction": { ... ComplaintExtraction } }

Response 200 (no key):
{ "ok": false, "error": "AI not configured" }
```

---

## Deployment

### Vercel (recommended)

1. Push to GitHub (this repo)
2. Import at [vercel.com](https://vercel.com)
3. Add all environment variables in Vercel dashboard
4. Deploy

All data pages use `export const dynamic = "force-dynamic"` — no stale static builds.

### Self-hosted

```bash
npm run build
npm start          # :3000
```

### Post-deploy checklist

- [ ] All env vars set in production
- [ ] `npm run db:migrate` run on production DB
- [ ] `npm run db:setup-storage` run once
- [ ] First user created → `profiles.role` set to `ADMIN` in Supabase Dashboard
- [ ] Supabase Storage bucket policies verified as private
- [ ] `NEXT_PUBLIC_SITE_URL` set to production domain
- [ ] RLS policies reviewed in Supabase → Auth → Policies

---

## Development Guide

### Running checks

```bash
npm run typecheck     # tsc --noEmit (must pass with zero errors)
npm run lint          # ESLint (must pass clean)
npm test              # Vitest (51 tests)
```

### Adding a feature

1. Write / update migration in `supabase/migrations/` (increment number)
2. Add types to `lib/types.ts`
3. Add constants to `lib/constants.ts`
4. Add Zod schema to `lib/validators.ts`
5. Add queries to `lib/queries.ts`
6. Add server actions to `lib/actions/`
7. Build pages in `app/` and components in `components/`
8. Run `npm run typecheck && npm run lint && npm test`

### Invariants to maintain

| Rule | Why |
|------|-----|
| Service role key server-side only | Security — never expose to browser |
| `requireRole()` before every mutation | Auth — checked before admin client created |
| `.is("deleted_at", null)` on all complaint reads | Soft-delete semantics |
| `writeAudit()` after every mutation | Audit trail completeness |
| `if (rpcError \|\| !rpc)` after every RPC call | Atomic counter integrity |
| AI is draft-only, human review always | AI safety policy |
| Idempotent migrations | Safe re-runs on production |

### Server action pattern

```typescript
export async function createComplaint(formData: FormData) {
  "use server";

  // 1. Auth check
  const { user, admin } = await authed(COMPLAINT_WRITE_ROLES);

  // 2. Validate
  const parsed = complaintSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "...", fieldErrors: parsed.error.flatten().fieldErrors };

  // 3. Case number (check RPC error!)
  const { data: rpc, error: rpcError } = await admin.rpc("next_complaint_case_number", { ... });
  if (rpcError || !rpc) return { error: "Failed to generate case number" };

  // 4. DB write
  const { data, error } = await admin.from("complaints").insert(toRow(parsed.data)).select().single();
  if (error) return { error: error.message };

  // 5. Timeline + audit
  await addTimeline(admin, { ... });
  await writeAudit(admin, { entityType: "complaint", entityId: data.id, changedBy: user.id, changes: [] });

  // 6. Revalidate
  revalidatePath("/complaints");
  return { success: true, id: data.id };
}
```

---

*Built with Next.js 15 · Supabase · Tailwind CSS · Anthropic Claude*
