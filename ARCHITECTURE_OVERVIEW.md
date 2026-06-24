# Architecture Overview: GBA · BBMP Ward & Engineer Tracker

This document describes the high-level architecture of the GBA · BBMP Ward & Engineer Tracker.

---

## 1. Architectural Style

The application is built on a **Server-First Web Architecture** utilizing **Next.js 15 (App Router)** and **Supabase (Backend-as-a-Service)**.

```mermaid
graph TD
  subgraph Client Browser
    UI[React 19 / Client Components]
    JS[browser client auth / RLS reads]
  end

  subgraph Next.js Server (Node.js runtime)
    Mid[Middleware.ts - Cookie Auth Refresh]
    Act[Server Actions - Auth-gated write ops]
    API[Route Handlers - Upload / OCR / cron]
    Qry[Queries.ts - Server Components Data Fetching]
    Forensics[Deterministic Forensics Engines]
    SafeLanguage[Safe-Language Letter Linter]
  end

  subgraph Supabase BaaS
    Auth[Supabase Auth]
    DB[(Postgres Database + RLS)]
    Storage[(Private Storage Buckets)]
  end

  subgraph External AI
    Claude[Anthropic Claude API]
  end

  UI -->|HTTP requests| Mid
  UI -->|Server Actions| Act
  UI -->|REST uploads| API
  Mid -->|Check getUser()| Auth
  Act -->|Bypasses RLS via Admin Client| DB
  Qry -->|RLS-scoped reads| DB
  API -->|signed URLs| Storage
  Act -->|Analyze Text| Claude
  API -->|Process Image| Claude
  Act -->|Deterministic audit| Forensics
  Act -->|Verify Text Safety| SafeLanguage
```

---

## 2. Layered Responsibilities

### 2.1 Routing & Layout Layer (`app/`)
Next.js page components fetch data server-side using direct client imports from `lib/queries.ts`. Layout files structure the common shell (sidebar, navigation, global search keyboard shortcuts).

### 2.2 Queries Layer (`lib/queries.ts`)
Houses all read-only database accesses. Queries use the Supabase JS SDK client initialized via the user's cookies. 
All queries are defensive: queries catching exceptions (such as missing columns or pre-migrated table structures) print server logs and degrade gracefully (returning empty lists or fallback objects), preventing page-wide crashes.

### 2.3 Mutations Layer (`lib/actions/`)
All database write operations (inserts, updates, deletes) are encapsulated in Next.js Server Actions.
Every action implements the standard security pipeline:
1. **Authorization Gate:** Calls `requireRole(allowedRoles)` to check user credentials before connecting to the database.
2. **Schema Validation:** Validates form inputs using strict Zod schemas (`lib/validators.ts`).
3. **Elevated Client:** Performs the write using the server-side elevated `createAdminClient()` (service-role client bypassing RLS checks) to ensure transactional reliability.
4. **Audit Logging:** Logs the transaction via `writeAudit()`, generating a diff payload of what changed.
5. **Timeline Event:** Writes a record to the entity's history timeline (e.g. `complaint_timeline`).
6. **Cache Invalidation:** Revalidates the page routes using Next.js `revalidatePath()`.

### 2.4 Service-only Layer (`lib/ocr/`, `lib/ai/`, `lib/forensics/`)
- **OCR Preprocessing:** Decoupled image manipulation using `sharp` to increase contrast and reduce image resolution to a maximum bounding size of 2200px before running OCR.
- **Tesseract Worker:** Spawns a Tesseract engine to extract Kannada and English text from preprocessed buffers.
- **AI Prompt Compiler:** Adapts prompts to Anthropic's message layout and controls structure parsing.
- **Deterministic Forensics:** Evaluates financial and structural rules using purely mathematical libraries.

---

## 3. Database Communication Flow

The application has two distinct paths for communicating with PostgreSQL:

1. **Client-scoped runtime (App Router):** The web server creates a browser client scoped to the current user's JWT. All reads are governed by **Row Level Security (RLS)** policies configured in the PostgreSQL database.
2. **Admin-scoped mutations & Devops scripts:** Database migrations (`scripts/migrate.ts`), seeds (`scripts/seed.ts`), and Server Actions use `DATABASE_URL` (direct pg connection) or the elevated `SUPABASE_SERVICE_ROLE_KEY` to execute changes directly, bypassing RLS.

---

## 4. Key Security Invariants

1. **Role-Based Server Guards:** Any mutation route MUST call `requireRole` with appropriate role constants (`ADMIN`, `EDITOR`, `RTI_MANAGER`, `COMPLAINT_MANAGER`, `FIELD_OFFICER`).
2. **RLS Policies:** RLS is enabled on all tables by default. Public reads are blocked unless allowed by explicit read policies (`can_read()`). Writes are governed by `can_write()` and `can_verify()` checks.
3. **No Direct User Secrets:** `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL` are strictly server-only. They are never exported or referenced in components that compile to browser scripts.
4. **Document Access Security:** Storage buckets are private. Signed URLs with short lifespans (typically 60 minutes) are generated on the server and passed to the client to render previews.
