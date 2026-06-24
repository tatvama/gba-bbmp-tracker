# Role Workflow Guide & Government Office Mapping

This document provides a guide to role responsibilities across key administrative workflows and maps each system role to an actual municipal office position.

---

## 1. Role Responsibilities in Key Workflows

### 1.1 Right to Information (RTI) Workflow
Managing the statutory timeline of public information disclosures.

- **Create RTI:**
  - **Authorized Roles:** `ADMIN`, `EDITOR`, `RTI_MANAGER`
  - **Action:** Starts the guided wizard at `/rti/new` to input details and save draft request files.
- **Edit RTI:**
  - **Authorized Roles:** `ADMIN`, `EDITOR`, `RTI_MANAGER`
  - **Action:** Modifies application subjects, description texts, or PIO details.
- **Configure Rules:**
  - **Authorized Roles:** `ADMIN`, `RTI_MANAGER`
  - **Action:** Updates default calendar thresholds under settings.
- **Analyze Reply:**
  - **Authorized Roles:** `ADMIN`, `RTI_MANAGER`
  - **Action:** Inputs the response text and triggers Claude's analysis classification.
- **Generate Appeal:**
  - **Authorized Roles:** `ADMIN`, `RTI_MANAGER`
  - **Action:** Initiates First/Second appeal letter builders when statutory timelines pass.
- **Close RTI:**
  - **Authorized Roles:** `ADMIN`, `EDITOR`, `RTI_MANAGER`
  - **Action:** Clocks resolution date and terminates notifications.

---

### 1.2 Complaint Lifecycle Workflow
Tracking public grievances, document uploads, and forensic job audits.

- **Create Complaint:**
  - **Authorized Roles:** `ADMIN`, `EDITOR`, `COMPLAINT_MANAGER`, `FIELD_OFFICER` (via quick mobile add)
  - **Action:** Registers complaints, triggering case number generation.
- **Upload Documents:**
  - **Authorized Roles:** `ADMIN`, `EDITOR`, `COMPLAINT_MANAGER`, `FIELD_OFFICER`
  - **Action:** Uploads site images or files to `complaint-documents` storage bucket.
- **Trigger OCR Processing:**
  - **Authorized Roles:** `ADMIN`, `EDITOR`, `COMPLAINT_MANAGER`
  - **Action:** Runs sharp preprocessing and Tesseract text extraction.
- **Approve AI Extraction:**
  - **Authorized Roles:** `ADMIN`, `COMPLAINT_MANAGER`
  - **Action:** Reviews Side-by-Side comparison screen and applies details.
- **Run Forensic Job Audit:**
  - **Authorized Roles:** `ADMIN`, `EDITOR`, `COMPLAINT_MANAGER`
  - **Action:** Runs mathematical engines auditing overall tender overruns and duplicate photos.
- **Close Complaint:**
  - **Authorized Roles:** `ADMIN`, `COMPLAINT_MANAGER`
  - **Action:** Marks resolution or files final closing notices.

---

### 1.3 Ward & Officer Tracker Workflow
Maintaining administrative listings of wards and directories.

- **View Wards & Contacts:**
  - **Authorized Roles:** All roles (including `VIEWER`).
  - **Action:** Performs global search (`⌘K`) and browses `/explorer` zoomable structures.
- **Edit Contacts:**
  - **Authorized Roles:** `ADMIN`, `EDITOR`
  - **Action:** Corrects engineer details (phone numbers, office locations, designations).
- **Verify Contacts:**
  - **Authorized Roles:** `ADMIN`, `EDITOR`, `VERIFIER`
  - **Action:** Signs verification status updates (changing cards to `VERIFIED`).
- **Manage Hierarchy:**
  - **Authorized Roles:** `ADMIN`, `EDITOR`
  - **Action:** Modifies Corporation, Division, and Subdivision connections.

---

## 2. Municipal Government Office Mapping

To help you understand the context of the platform, here is how roles map to actual personnel roles inside the municipal office:

| System Role | Municipal Office Position | Justification & Case Examples |
| :--- | :--- | :--- |
| **`VIEWER`** | **Public Observer / Citizen** | Residents, active citizens, and civil society groups (e.g. ward committee members) who browse wards to find responsible engineers and track progress. |
| **`FIELD_OFFICER`** | **Junior Engineer (JE) / Inspector** | Junior inspectors on-site logging inspections, uploading pothole repair photos, and reporting completed works. |
| **`EDITOR`** | **Data Entry Operator / Clerk** | Clerks typing incoming paper complaints, updating directories, or recording transfer orders. |
| **`VERIFIER`** | **Senior Division Clerk / Superintendent** | Senior administrative clerks verifying contact numbers, officer identities, and email addresses. |
| **`RTI_MANAGER`** | **Public Information Officer (PIO)** | Administrative officer in charge of the division's RTI filings, tracking 30-day deadlines, and receiving appeals. |
| **`COMPLAINT_MANAGER`** | **Executive Engineer (EE) / Auditor** | High-level engineer running forensic project audits, reviewing contractor billing compliance, and signing bill-stop orders. |
| **`ADMIN`** | **IT Administrator / System Architect** | System administrators managing permissions, resetting data queues, and updating global settings. |
