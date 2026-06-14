# Claude Code Build Prompt — GBA / BBMP Ward & Engineer Contact Platform

> Paste this whole file as your first message to Claude Code. It is written to be executed in phases, not all at once.

---

## 0. Role and mandate

You are a senior full-stack engineer. Build a production-grade, maintainable civic-data platform that tracks Bengaluru's ward restructuring and the engineers responsible for each area. Optimise for **data integrity and long-term maintainability over feature count**. When a requirement is ambiguous or a destructive action is implied, **stop and ask** rather than guessing.

Work in the **phases** defined in §7. After each phase: run `typecheck`, `lint`, and `build`, paste the results, and wait for my go-ahead before the next phase. Commit at the end of each phase with a clear message. Do not jump ahead.

---

## 1. Context you must understand before writing code

Bengaluru's municipal map has been redrawn **twice**, and this app exists to trace any locality across all three states and reach the responsible engineer:

```
Old BBMP (198 wards)  →  New BBMP (225 wards)  →  GBA (369 wards, 5 corporations)
```

Three facts that drive the entire data model — read them carefully:

1. **The engineer's unit of responsibility is the *Engineering Sub-Division*, not the ward.** One engineering sub-division covers several wards. There are **75** of them in the BBMP-225 system. Contacts attach to the sub-division; wards inherit the contact through it. Do not model engineers per-ward.

2. **There is no shared key between BBMP-225 and GBA-369.** They are independent restructures. The only reliable link is the **Assembly Constituency (AC)**: each BBMP-225 ward carries an AC (e.g. `175-Bommanahalli`), and each GBA corporation lists the ACs it contains. The 225→corporation link is therefore **derived**, and must be **labelled as derived in the UI**, never presented as an authoritative ward-to-ward mapping.

3. **Source PDFs were scanned/image-based.** Some mappings and all GBA ward *names* (Kannada-only in the source) are incomplete. The app must treat completeness as a spectrum: every record carries provenance + a verification status, and the UI must surface what is unverified or missing rather than hide it.

**You must not invent ward mappings, GBA ward names, or engineer contacts to fill gaps.** Missing data stays missing and is flagged. Fabrication is the single worst failure mode for this project.

---

## 2. Real input data (use these — do not assume an xlsx)

Three JSON files will be placed in `./data/`:

- `bbmp225_wards.json` — **authoritative**, fully validated. 225 wards, no gaps/dupes, 75 engineering sub-divisions. Each record:
  ```json
  {
    "new_no": 221, "new_name": "HSR Layout", "property_count": 8720,
    "zone": "Bommanahalli", "ac": "175-Bommanahalli", "division": "Bommanahalli",
    "old_subdiv": "HSR Layout", "eng_subdiv": "HSR Layout", "eng_subdiv_sl": 1,
    "old_wards": ["174-HSR Layout", "190-Mangammanapalya", "175-Bommanahalli"]
  }
  ```
  Note: `old_wards` is captured at the engineering-sub-division level; some lists are empty where the scan was ambiguous — that is expected, flag don't fill.

- `gba_structure.json` — 5 corporations with `wards / divisions / subdivisions` counts and `assembly_constituencies[]`. `ward_list` is intentionally empty (Kannada-only in source) — this is the **import slot**.

- `engineers_seed.json` — a handful of **unverified** engineer contacts from older official BBMP directories, keyed by `eng_subdiv`. Every seeded contact must be ingested with `verificationStatus = "Pending"` and `confidenceScore = "Low"`.

If a file is missing at seed time, fall back to a small built-in sample so the app still runs (see §11). Also accept an optional `data/GBA_BBMP_Ward_Tracking_Platform.xlsx`: if present, the importer reads it; if absent, the app is fully functional from JSON + sample data.

---

## 3. Tech stack (pinned, with reasons — do not substitute without asking)

- **Next.js 15 (App Router) + React 19 + TypeScript (strict).** Server Components for reads, Server Actions for mutations.
- **Tailwind CSS + shadcn/ui** for the component layer.
- **Prisma + PostgreSQL.** Use a local Postgres via `docker-compose.yml` you generate; connection string in `.env` only.
- **Auth.js (NextAuth v5)** with the Credentials provider + a `role` claim. Keep it simple; no external IdP.
- **Zod** for all input/import validation; share schemas between client and server.
- **TanStack Table v8** for searchable/filterable/sortable/paginated tables.
- **SheetJS (xlsx)** for import and **export** (CSV + XLSX).
- **Vitest** for the testing floor (§9).
- Map/lat-lng: include the fields, but **no map provider/API key in phase 1** — render a placeholder.

Pin exact versions in `package.json`. No `latest`. No hardcoded secrets anywhere; provide `.env.example`.

---

## 4. Domain model (Prisma) — reflects the real structure

Implement these models. Note `EngineeringSubDivision` is a **first-class table** (the engineer's unit), and `Ward` links to it.

- **User** — id, name, email (unique), passwordHash, role (`ADMIN|EDITOR|VERIFIER|VIEWER`), timestamps.
- **Corporation** — id, code (`KENDRA|PURVA|PASHCHIMA|UTTARA|DAKSHINA`), name, nameKn, wardCount, divisionCount, subdivisionCount, assemblyConstituencies (string[]), address, phone, email, website, notes.
- **Division** — id, name, corporationId, address, notes.
- **EngineeringSubDivision** — id, name, slNo, divisionId, address, notes. *(This is what a Contact attaches to.)*
- **Ward** — id, newNo (unique), newName, propertyCount, zone, assemblyConstituency, oldSubdiv, oldWards (string[]), divisionId, engSubDivisionId, derivedCorporationId (nullable; AC-derived, mark as derived), source, sourcePage, verificationStatus, confidenceScore, notes, timestamps.
- **Contact** — id, fullName, designation (enum: Chief/Superintending/Executive/Assistant Executive/Assistant/Junior Engineer, Health Officer, Revenue Officer, Ward Engineer, Contractor, Office Staff), department, corporationId?, divisionId?, engSubDivisionId?, officeAddress, phone, whatsapp, email, officeTiming, jurisdictionNotes, latitude?, longitude?, source, sourcePage, verificationStatus (`VERIFIED|PENDING|NEEDS_CORRECTION|RETIRED_TRANSFERRED|UNKNOWN`), lastVerifiedDate?, confidenceScore (`HIGH|MEDIUM|LOW`), publicNotes, internalNotes, createdById?, updatedById?, timestamps.
- **Complaint** — id, title, type (road/drain/garbage/streetlight/public-works/bill/RTI/contractor/other), wardId?, engSubDivisionId?, contactId?, complaintNumber?, rtiNumber?, dateSubmitted?, dueDate?, status (`DRAFT|SUBMITTED|UNDER_REVIEW|REPLY_RECEIVED|ESCALATED|CLOSED`), notes, nextActionDate?, reminderFlag, timestamps.
- **SourceDocument** — id, title, fileName, documentType, date?, url?, notes.
- **AuditLog** — id, entityType, entityId, fieldName, oldValue?, newValue?, changedById, changedAt. Write on **every** Contact/Ward mutation.
- **ImportLog** — id, fileName, sheetName?, totalRows, importedRows, skippedRows, errorRows, dryRun (bool), importedById, createdAt.

Generate a real initial migration. Validate the schema (`prisma validate`) before moving on.

---

## 5. Functional modules (scoped per phase in §7)

**Dashboard** — summary cards (corporations, GBA wards, BBMP-225 wards, old-198 wards represented, divisions, engineering sub-divisions, contacts, verified count, pending count, missing-phone/email/address count); recently-updated list; needs-verification list; quick search; filters by corporation/division/sub-division/designation/status.

**Master Ward Tracking** — TanStack table over `Ward` showing the full lineage (old wards → BBMP-225 no+name → derived corporation), property count, AC, zone, division, engineering sub-division, source, verification badge. Search, column filters, sort, pagination, saved filters (localStorage is fine), CSV/XLSX export, row → ward detail page, inline edit (Editor+).

**Engineer / Officer Directory** — table + cards over `Contact`. Search by name/designation/phone/email/division/sub-division; filter by corporation/division/sub-division/designation/status; **duplicate detection** by normalised phone/email/name; "missing details" filter; export; import. Each card: Call (`tel:`), WhatsApp (`https://wa.me/91…`), Copy contact, Email, verification + confidence badges, "unverified seed" tag where applicable.

**Corporation pages (5)** — overview, counts, divisions, derived ward count + "GBA ward names: import pending" state, officer contacts, AC list, source.

**Division & Sub-Division pages** — division → its engineering sub-divisions + wards + assigned contacts; sub-division → parent division/corporation, ward list, assigned contact(s), address, open verification issues.

**Ward detail page** — BBMP-225 identity, old-ward mapping (or "not mapped"), derived corporation (labelled derived), division, engineering sub-division, AC, property count, engineer contact (via sub-division), sources, verification history (from AuditLog), notes, related complaints.

**Complaint / RTI tracker** — CRUD with the fields above; list with status filters; reminder flag + next-action date; attachment field is a placeholder string in phase 1.

**Import system (Admin)** — upload XLSX/CSV → intelligent column mapping with a confirm step → Zod validation with per-row errors → **dry-run** preview → skip-or-update duplicates → write ImportLog. Must read the provided JSON via the seed path too.

**Reports (exportable)** — missing engineer contacts; pending verification; ward→sub-division mapping; division-wise and corporation-wise contact lists; recently changed; duplicate contacts; complaint/RTI pending.

**Auth & roles** — Admin (all + user mgmt, import, export, audit, merge duplicates), Editor (add/edit), Verifier (set verification + notes), Viewer (read-only). Gate Server Actions by role, not just UI.

---

## 6. Cross-cutting rules

- **Provenance & verification are mandatory** on Ward and Contact. New records default to `PENDING` / appropriate confidence. UI always shows the badge.
- **Derived data is labelled.** Anywhere the 225→GBA-corporation link appears, show a small "derived from constituency" marker.
- **Validation:** Indian mobile (`+91`/10-digit) and landline formats; valid email; numeric ward numbers where applicable; required: designation, verificationStatus. Flag records missing corporation/division/sub-division.
- **Audit everything** that mutates Contact/Ward.
- **Accessibility & field use:** mobile-responsive, visible keyboard focus, print-friendly contact/ward sheets, large tap targets.
- **i18n-ready:** keep English + Kannada label fields; don't hardcode display strings where a `nameKn` exists.
- **Security:** secrets only in env; hash passwords (bcrypt/argon2); validate every Server Action input with Zod; no secrets in client bundles or logs.

---

## 7. Build phases (checkpoint after each — run typecheck/lint/build, then pause)

- **Phase 0 — Scaffold:** Next 15 + TS strict + Tailwind + shadcn init; `docker-compose.yml` for Postgres; `.env.example`; base layout with top nav + sidebar (Dashboard, Search, Wards, Old BBMP Mapping, Corporations, Divisions, Sub-Divisions, Contacts, Complaints/RTI, Import, Reports, Sources, Audit Logs, Settings); empty routed pages. **DoD:** `npm run dev` renders the shell.
- **Phase 1 — Schema, migration, seed:** Prisma models (§4); initial migration; `prisma/seed.ts` that ingests the three JSON files (and xlsx if present), seeds 5 corporations, divisions, 75 engineering sub-divisions, 225 wards with AC-derived `derivedCorporationId`, and the unverified seed contacts; sample fallback if files missing. **DoD:** seed runs idempotently; counts match (225 wards, 75 eng sub-divisions, 5 corporations summing to 369/50/150).
- **Phase 2 — Read UI:** Dashboard cards; Master Ward table (read-only); ward/corporation/division/sub-division detail pages; contact directory (read-only). **DoD:** every nav item reaches real data.
- **Phase 3 — Global search:** grouped results (Wards / Contacts / Divisions / Sub-Divisions / Complaints) across all fields in the spec.
- **Phase 4 — Auth + editing:** Auth.js credentials + roles; role-gated Server Actions; add/edit Ward + Contact; verification actions; AuditLog writes.
- **Phase 5 — Import/Export:** import wizard with mapping → Zod validation → dry-run → commit + ImportLog; CSV/XLSX export on tables and reports.
- **Phase 6 — Complaints/RTI + Audit views:** complaint CRUD + tracker; audit log viewer; verification history on detail pages.
- **Phase 7 — Reports + polish:** all reports; duplicate-merge for admins; print sheets; dark mode; "Copy WhatsApp message" and "Generate RTI draft" (template-filled from ward/contact data); empty/error states with actionable copy.

---

## 8. Definition of Done (overall)

- `npm run typecheck && npm run lint && npm run build` all pass clean.
- `prisma validate` passes; `prisma migrate dev` and `seed` succeed from a clean DB.
- App runs with **and without** the xlsx (JSON + sample fallback).
- No `latest` versions, no hardcoded secrets, `.env.example` complete.
- Every nav item links to a working page; no dead routes.
- Seed produces the verified counts above; derived links are labelled; unverified seed contacts are flagged.

---

## 9. Testing floor (Vitest — required, not optional)

- **Validators:** Indian phone + email Zod schemas (valid/invalid cases).
- **AC→corporation mapper:** every BBMP-225 ward resolves to exactly one corporation; total mapped = 225, unmapped = 0.
- **Import column-mapper:** maps a known header row correctly and reports row errors on a malformed row.
- **Duplicate detection:** matches on normalised phone/email/name.

---

## 10. Deliverables

`package.json`, full App-Router tree, Prisma schema + migration + `seed.ts`, import service, Server Actions/API routes, shadcn UI components, all pages, Vitest tests, `docker-compose.yml`, `.env.example`, and a `README.md` covering: install, DB config, migrate, seed, import the xlsx, create an admin user, run dev, export data, and deploy (Vercel + managed Postgres notes).

---

## 11. Sample fallback data (only used if JSON/xlsx absent)

5 corporations; ≥5 wards spanning ≥2 corporations; ≥5 contacts across designations (≥2 marked `PENDING`); ≥3 complaint/RTI entries in different statuses. Clearly tagged as `source = "sample"` so it's never mistaken for real records.

---

## 12. Non-goals for v1 (do not build unless I ask)

Live map provider/API keys; SMS/email sending; file/attachment uploads (placeholder field only); public-facing citizen portal; multi-tenant orgs; real-time/websockets; mobile app. Keep these out so the core ships solid.

---

**Begin with Phase 0. Confirm the plan in 3–4 lines, then scaffold. Stop at each checkpoint.**
