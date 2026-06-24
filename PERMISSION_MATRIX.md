# Permission Matrix: GBA · BBMP Ward & Engineer Tracker

This document maps application features to user roles, detailing exactly what operations each role is permitted or denied.

---

## 1. Feature Access Matrix

| Feature / Action | VIEWER | FIELD_OFFICER | EDITOR | VERIFIER | RTI_MANAGER | COMPLAINT_MANAGER | ADMIN |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **View Wards & Contacts** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Create/Edit Wards** | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ | ✓ |
| **Create/Edit Contacts** | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ | ✓ |
| **Verify Contacts (Badges)** | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ |
| **Create/Edit RTI cases** | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ | ✓ |
| **Generate RTI Appeals** | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ |
| **Configure RTI Deadlines** | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ |
| **Create Complaint** | ✗ | ✓ (Mobile Only) | ✓ | ✓ | ✗ | ✓ | ✓ |
| **Upload Site Documents** | ✗ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ |
| **Trigger OCR pipeline** | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ | ✓ |
| **Verify AI Text Extraction**| ✗ | ✗ | ✗ | ✓ | ✗ | ✓ | ✓ |
| **Run Job Forensic Audit** | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ | ✓ |
| **Soft-Delete Complaint** | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| **Hard-Delete Records** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| **View Audit Logs** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |

---

## 2. Server Action Guard Constants

The application maps security controls using these arrays defined in [lib/constants.ts](file:///d:/gba-bbmp-tracker/gba-bbmp-tracker/lib/constants.ts):

### 2.1 General Write Roles (`WRITE_ROLES`)
- **Roles:** `['ADMIN', 'EDITOR']`
- **Guards:** Basic CRUD operations on structural components (Corporations, Divisions, Sub-Divisions).

### 2.2 Verification Roles (`VERIFY_ROLES`)
- **Roles:** `['ADMIN', 'EDITOR', 'VERIFIER']`
- **Guards:** Reviewing and signing directories, editing confidence scores.

### 2.3 RTI Module Write Roles (`RTI_WRITE_ROLES`)
- **Roles:** `['ADMIN', 'EDITOR', 'RTI_MANAGER']`
- **Guards:** Access to `/rti/new`, `/rti/[id]/first-appeal`, `/rti/[id]/second-appeal`, `/rti/settings`, and database writes on tables `rti_applications`, `rti_first_appeals`, `rti_second_appeals`, `templates`, and `app_settings`.

### 2.4 Complaint Module Write Roles (`COMPLAINT_WRITE_ROLES`)
- **Roles:** `['ADMIN', 'EDITOR', 'COMPLAINT_MANAGER']`
- **Guards:** Access to `/complaints/new`, `/api/complaints/upload`, `/complaints/job/[jobNumber]/audit`, `/complaints/risk`, and mutations to `complaints`, `complaint_documents`, `complaint_timeline`, and `ocr_jobs`.

---

## 3. Database Functions Check Enforcement

RLS policies delegate to three database functions checking session parameters:
1. `public.can_write()`: Restricts raw writing. Allowed if user role matches `ADMIN`, `EDITOR`, `RTI_MANAGER`, or `COMPLAINT_MANAGER`.
2. `public.can_verify()`: Restricts verification. Allowed if user role matches `ADMIN`, `EDITOR`, `VERIFIER`, `RTI_MANAGER`, `COMPLAINT_MANAGER`, or `FIELD_OFFICER`.
3. `public.is_admin()`: Restricts administrative updates. Allowed only if user role matches `ADMIN`.
