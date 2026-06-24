# Role Analysis: GBA · BBMP Ward & Engineer Tracker

This document provides a detailed technical and business analysis of all user roles implemented in the **GBA · BBMP Ward & Engineer Tracker** Role-Based Access Control (RBAC) system.

---

## 1. VIEWER (Public Observer)

### Purpose
To provide public/read-only visibility across civic administrative structures, ward reorganization boundaries, engineer contact directories, and active complaint/RTI status pages.

### Real User
A local Bengaluru resident, civil society member, or internal junior staff member looking up administrative information.

### Permissions & Restrictions
- **Can View:** Wards, GBA Wards lineage, Engineer directory, Complaint statuses, and RTI tracker details.
- **Can Create:** Nothing.
- **Can Update:** Nothing.
- **Can Delete:** Nothing.
- **Restrictions:** All database write operations are blocked. Any attempt to access server actions throws an `AuthorizationError`.
- **Database Scope:** Scoped strictly to Row Level Security (RLS) select operations:
  - `SELECT` on `wards`, `gba_wards`, `contacts`, `app_settings` is allowed.
  - Complaints with a non-null `deleted_at` are automatically filtered out.

---

## 2. FIELD_OFFICER (Site Inspection Officer)

### Purpose
To support on-the-ground mobile workers who inspect complaint locations, log inspection notes, and upload evidence photographs.

### Real User
A junior site engineer, ward officer assistant, or private inspector visiting site locations.

### Permissions & Restrictions
- **Can View:** All public civic data.
- **Can Create:** Quick complaints via the mobile-first form layout (`/complaints/mobile/new`) and evidence uploads.
- **Can Update:** Adds inspection logs and field notes on-site.
- **Can Delete:** Nothing.
- **Restrictions:** Blocked from editing official engineer contact directories, configuring statutory RTI deadline rules, running forensic financial audits, or viewing full platform settings.
- **Database Scope:** RLS `can_verify()` allows inserts into:
  - `complaint_timeline` (logs field inspection dates).
  - `complaint_documents` (uploads photo evidence).

---

## 3. EDITOR (Data Entry Operator)

### Purpose
To act as the primary operational user responsible for keeping civic databases, ward boundaries, and directories updated.

### Real User
An office administrator or database operator in the BBMP division headquarters.

### Permissions & Restrictions
- **Can View:** All screens.
- **Can Create:** Wards, Corporations, Contacts, Complaints, and RTI filings.
- **Can Update:** Core details on wards, contacts, and cases.
- **Can Delete:** Nothing.
- **Restrictions:** Blocked from changing engineer verification statuses, verifying OCR extraction proposals, executing soft deletes, or updating statutory settings.
- **Database Scope:** Governed by `can_write()` PostgreSQL function, admitting inserts and updates to all primary schema tables.

---

## 4. VERIFIER (Senior Verification Officer)

### Purpose
To review and verify engineer contact records and audit newly input administrative directories.

### Real User
A Senior Division Superintendent or Director checking the integrity of contact databases.

### Permissions & Restrictions
- **Can View:** All screens.
- **Can Create:** Wards, Contacts, Complaints, and RTIs.
- **Can Update:** Standard records.
- **Can Verify:** Explicitly allowed to change contact status flags to `VERIFIED` and approve automated OCR translations.
- **Can Delete:** Nothing.
- **Restrictions:** Cannot access system configuration or perform soft-delete operations.
- **Database Scope:** Evaluated by `can_verify()` database role check admitting directory verification updates.

---

## 5. RTI_MANAGER (RTI Department Officer)

### Purpose
To manage the Right to Information application lifecycle, ensure response timelines are met, and draft statutory appeals.

### Real User
The Public Information Officer (PIO) or Assistant PIO in the divisional RTI division.

### Permissions & Restrictions
- **Can View:** All screens, calendar visualizers, and deadline dashboards.
- **Can Create:** RTI applications, templates, and appeals.
- **Can Update:** RTI status flags, category details, and application records.
- **Can Configure:** Modifies statutory RTI deadline rules (Normal reply, Life & Liberty, Appeals) under settings.
- **Can Delete:** Nothing.
- **Restrictions:** Cannot edit complaint files or audit public works bills.
- **Database Scope:** Authorized via Server Action check gates mapped to `RTI_WRITE_ROLES`.

---

## 6. COMPLAINT_MANAGER (Complaint Resolution Officer)

### Purpose
To manage the end-to-end civic complaint lifecycle, run forensic financial job audits, and draft letter templates.

### Real User
An Executive Engineer, Head of Public Works Audit, or Grievance Officer.

### Permissions & Restrictions
- **Can View:** Full 10-tab detail view, OCR queue, and risk profiles.
- **Can Create:** Complaints, timelines, follow-ups, and letter drafts.
- **Can Audit:** Runs deterministic forensic audit checks over government job numbers.
- **Can Update:** Approves/discards AI extraction values and edits case details.
- **Can Delete:** Allowed to **soft-delete** complaints by setting `deleted_at = NOW()`.
- **Restrictions:** Blocked from editing administrative RTI settings.
- **Database Scope:** Evaluated by `COMPLAINT_WRITE_ROLES` database updates and storage permissions.

---

## 7. ADMIN (Super Administrator)

### Purpose
To maintain full database authorization control, access all system configuration settings, and audit security logs.

### Real User
A System Architect, Database Engineer, or Divisional IT Administrator.

### Permissions & Restrictions
- **Can View:** All sections, including sensitive audit trail logs.
- **Can Create / Update:** All files, roles, profiles, and directories.
- **Can Delete:** The only role allowed to perform **hard deletes** (permanent row removals) on DB tables.
- **Restrictions:** None.
- **Database Scope:** Bypasses RLS controls. Verified via server-level `is_admin()` and elevated service-role credentials.
