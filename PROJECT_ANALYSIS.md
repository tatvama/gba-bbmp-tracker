# Project Analysis: GBA · BBMP Ward & Engineer Tracker

A full-stack, civic accountability and engineering contact management platform for Bengaluru. This document provides a complete technical analysis of the codebase, detailing its structure, modules, and business logic.

---

## 1. Technology Stack

The platform is designed as a modern, type-safe web application using the following technologies:

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | Next.js 15.1.6 (App Router, React 19) | Server components, routing, server actions, and client rendering. |
| **Language** | TypeScript 5.7.3 (Strict mode) | Compile-time safety and self-documenting data interfaces. |
| **Styling** | Tailwind CSS 3.4 + shadcn/ui + Radix UI | Utility-first responsive design, component styling, and accessible primitives. |
| **Database** | Supabase (PostgreSQL 15+) | Relational storage, raw SQL migrations, and row-level security (RLS). |
| **Client Auth** | Supabase Auth (`@supabase/ssr`) | Cookie-based session tracking mapped to custom database user roles. |
| **Data Tables** | TanStack Table v8 (`@tanstack/react-table`) | High-performance client-side and server-side tabular sorting, filtering, and pagination. |
| **OCR Engine** | Tesseract.js 7.0 + Sharp | Server-side image preprocessing (grayscale, sharpen, contrast) and OCR text extraction. |
| **AI Layer** | Anthropic Claude (Optional / Env-gated) | AI drafting of RTI applications, appeals, replies, and complaint information extraction. |
| **Document Export**| SheetJS (xlsx) + Docx 9.7 | Client-side Excel export for ward data, and server-side DOCX generation for formal letters. |
| **Test Runner** | Vitest 2.1.8 | Unit and integration testing for business logic, math calculations, and linting. |

---

## 2. Directory Structure

```
├── app/                              # Next.js App Router Pages & API Routes
│   ├── page.tsx                      # Root dashboard with aggregate system stats
│   ├── layout.tsx                    # Top navigation, sidebar sidebar nav, and command palette
│   ├── api/                          # Next.js Route Handlers (upload, ocr, cron, exports)
│   ├── complaints/                   # Civic complaints module
│   │   ├── page.tsx                  # Complaint list view (TanStack Table)
│   │   ├── dashboard/                # Aggregated complaint counters and priority distribution
│   │   ├── ocr-queue/                # Status monitoring for server-side OCR jobs
│   │   ├── risk/                     # Per-contractor forensic profiles and repeat anomalies
│   │   ├── job/[jobNumber]/audit    # Detrimistic forensic audit against government job numbers
│   │   └── [id]/                     # 10-tab detail view (Timeline, OCR, Action Taken, Audit Log)
│   ├── rti/                          # RTI (Right to Information) module
│   │   ├── page.tsx                  # RTI dashboard
│   │   ├── calendar/                 # Deadlines visualizer
│   │   └── new/                      # 10-step guided filing wizard
│   ├── wards/                        # BBMP 225-ward details and lineage tracking
│   ├── contacts/                     # Contact directory for engineers, officers, and contractors
│   ├── explorer/                     # Zoomable geographic TreeMap ward visualizer
│   └── search/                       # Unified command-palette global search endpoint
│
├── components/                       # UI Components (divided by domain)
│   ├── ui/                           # Radix-based shadcn primitives (button, dialog, select, etc.)
│   ├── nav/                          # App-wide navigation (Sidebar, TopNav, CommandPalette)
│   ├── complaints/                   # Document uploaders, AI diff viewers, timeline visualizations
│   └── rti/                          # Appeal generators, deadline countdown badges, timeline logs
│
├── lib/                              # Core Utility Layer (Framework-Free & Server-Bound)
│   ├── actions/                      # Next.js Server Actions (all auth-gated write operations)
│   ├── ai/                           # AI provider adapters and prompt construction engines
│   ├── forensics/                    # Deterministic mathematical rules for job auditing
│   ├── letters/                      # Safe-language linter and letter builders
│   ├── ocr/                          # Sharp image preprocessing and Tesseract integration
│   ├── storage/                      # Supabase Storage client wrapper (signed URLs, buckets)
│   ├── auth.ts                       # Server-side auth, session retrieving, and role checks
│   ├── queries.ts                    # Optimized PostgreSQL queries using the Supabase JS client
│   └── types.ts                      # TypeScript models matching DB schemas and relations
│
├── supabase/                         # SQL Database Migrations
│   └── migrations/                   # Sequential migration scripts (0001_init.sql to 0012_audit_intake.sql)
│
└── scripts/                          # DB Seeding, Storage Setup, and Maintenance Utilities
```

---

## 3. Core Modules

### 3.1 Ward Tracker & Contacts Directory
- **Geography Mapping:** Maps Bengaluru's transition across **198 (old)** → **225 (new)** → **369 (GBA)** ward restructures. Keeps lineage trees of how localities changed zones, assembly constituencies, and administrative corporations.
- **Verification Directory:** Engineers and civic officers are tracked with verification statuses (`VERIFIED`, `PENDING`, `NEEDS_CORRECTION`, `RETIRED_TRANSFERRED`). They are linked to their corresponding engineering sub-divisions and wards. A confidence scorecard (`HIGH`, `MEDIUM`, `LOW`) warns viewers about unverified source data.

### 3.2 RTI (Right to Information) Module
- **Filing Wizard:** A 10-step wizard helps users gather facts, draft statements, pick template questions, generate AI drafts, preview, and save.
- **Deadline Engine (`lib/rti-deadlines.ts`):** Calculates statutory countdowns:
  - Normal reply: 30 days.
  - Life & liberty: 48 hours.
  - First appeal filing: 30 days from reply deadline.
  - First appeal decision: 30–45 days.
  - Second appeal filing: 90 days from first appeal decision.
  - Countdowns are color-coded in real-time (`🟢 On track`, `🟡 Due soon`, `🔴 Overdue`).

### 3.3 Advanced Complaint Management
- **Case Code Generation:** Generates atomic sequential case numbers (`DM-CMP-YYYY-000001`) using a PostgreSQL `FOR UPDATE` lock function.
- **OCR Pipeline:** Raster uploads undergo server-side image preprocessing using `sharp` (grayscale, rotation normalization, sharpen, contrast expansion) before passing to `tesseract.js` recognizing `eng+kan`.
- **AI Document Extraction:** The AI extracts details (priority, location, complaint type, description) and generates structured JSON. **Human review is mandatory:** changes must be triaged on a diff screen before being merged into the database.
- **Audit Logging & Soft Delete:** Immutable log records capture every field change. Soft delete hides complaints containing a non-null `deleted_at` timestamp.

### 3.4 Forensic Public-Works Audit & Letter Drafting
- **Deterministic Auditing (`lib/forensics/`):** Rather than letting AI estimate numbers, calculations (arithmetic verification, quantity/rate caps, contractor eligibility, insurance compliance, MB-book chronology) are fully written in deterministic JavaScript libraries.
- **Safe-Language Linting (`lib/letters/safe-language.ts`):** Any generated document is passed through a regex-based linter that flags absolute accusations or Guruji/Trust signatures, forcing the draft to use *documented suspicion seeking records* to ensure legal safety.

---

## 4. Key Business Logic and Gotchas

1. **Supabase IPv6 Host resolution:** Supabase's direct connection URLs are IPv6-only. Local build environments using IPv4-only networks will fail to resolve the host. To fix this, the app uses the **Session Pooler URL** (`*.pooler.supabase.com:5432`) which handles IPv4 routing.
2. **AI Bounded Principle:** The system strictly separates classification/extraction (AI-driven) from grading/auditing (fully deterministic JS libraries). 
3. **AppLocker Native DLL Block:** The native DLL `sharp-win32-x64-0.35.1.node` under `node_modules` is blocked from executing on Windows systems with strict Application Control policies. The application resolves this by dynamically importing `sharp` at runtime rather than importing it statically, allowing compile-time page collection and test runs to bypass the block.
