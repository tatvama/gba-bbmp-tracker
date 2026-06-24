# Database Schema Analysis: GBA · BBMP Ward & Engineer Tracker

This document details the database architecture of the platform. The database runs on **PostgreSQL** inside the Supabase BaaS ecosystem.

---

## 1. Entity Relationship (ER) Summary

The schema is divided into three core logical domains:
1. **Civic Hierarchy Module:** Corporations → Divisions → Engineering Sub-Divisions → Wards (and GBA Wards) with Contacts (Engineers/Officers).
2. **RTI Module:** Applications → First Appeals → Second Appeals, along with Templates and AI Drafts.
3. **Complaint Module:** Complaints → Documents (with OCR states) → Timeline (Audit Trail) → Replies, Actions, Comms, and Escalations.

---

## 2. Table-by-Table Reference

### 2.1 profiles
- Extends Supabase Auth users.
- **Columns:**
  - `id` (uuid, Primary Key, references `auth.users`)
  - `email` (text, unique)
  - `full_name` (text)
  - `role` (text, default: `'VIEWER'`, values: `ADMIN`, `EDITOR`, `VERIFIER`, `VIEWER`, `RTI_MANAGER`, `COMPLAINT_MANAGER`, `FIELD_OFFICER`)
  - `updated_at` / `created_at` (timestamptz)

### 2.2 corporations
- Represents the GBA regional corporations.
- **Columns:**
  - `id` (uuid, Primary Key)
  - `code` (text, unique, e.g. `'KENDRA'`, `'PURVA'`)
  - `name` (text, e.g. `'Bengaluru Central'`)
  - `ward_count` (integer)

### 2.3 divisions
- Represents BBMP administrative divisions.
- **Columns:**
  - `id` (uuid, Primary Key)
  - `name` (text, unique)
  - `corporation_id` (uuid, references `corporations.id`)

### 2.4 eng_subdivisions
- Represents BBMP engineering subdivisions.
- **Columns:**
  - `id` (uuid, Primary Key)
  - `name` (text, unique)
  - `division_id` (uuid, references `divisions.id`)
  - `sl_no` (text, optional Serial Number)

### 2.5 wards
- Master list of 225 wards (re-structured).
- **Columns:**
  - `id` (uuid, Primary Key)
  - `new_no` (integer, unique)
  - `new_name` (text)
  - `old_no` (integer)
  - `old_name` (text)
  - `assembly_constituency` (text)
  - `division_id` (uuid, references `divisions.id`)
  - `eng_subdivision_id` (uuid, references `eng_subdivisions.id`)
  - `derived_corporation_id` (uuid, references `corporations.id`)
  - `old_wards` (text[], array of contributing legacy 198-wards)

### 2.6 gba_wards
- GBA master list of 369 wards.
- **Columns:**
  - `id` (uuid, Primary Key)
  - `ward_no` (integer)
  - `name_en` (text)
  - `name_kn` (text)
  - `corporation_id` (uuid, references `corporations.id`)

### 2.7 contacts
- Engineers, officers, and contractors directory.
- **Columns:**
  - `id` (uuid, Primary Key)
  - `name` (text)
  - `designation` (text)
  - `phone` (text)
  - `email` (text)
  - `office_address` (text)
  - `verification_status` (text, e.g., `'VERIFIED'`, `'PENDING'`)
  - `confidence_score` (text, e.g., `'HIGH'`, `'MEDIUM'`)
  - `corporation_id` (uuid, references `corporations.id`)
  - `division_id` (uuid, references `divisions.id`)
  - `eng_subdivision_id` (uuid, references `eng_subdivisions.id`)
  - `is_officer` (boolean, default: `false`)
  - `officer_grade` (text)

### 2.8 complaints
- Civic complaints tracking table. Includes soft delete columns.
- **Columns:**
  - `id` (uuid, Primary Key)
  - `case_number` (text, unique, e.g., `'DM-CMP-2026-000001'`)
  - `title` (text)
  - `description` (text)
  - `status` (text)
  - `priority` (text)
  - `location` (text)
  - `ward_id` (uuid, references `wards.id`, optional)
  - `reporter_name` / `reporter_phone` (text)
  - `deleted_at` (timestamptz, NULL for active complaints)
  - `created_at` / `updated_at` (timestamptz)

### 2.9 complaint_documents
- Uploaded files associated with complaints, capturing OCR & AI extraction state.
- **Columns:**
  - `id` (uuid, Primary Key)
  - `complaint_id` (uuid, references `complaints.id`)
  - `file_path` (text, location in Supabase Storage)
  - `file_name` (text)
  - `mime_type` (text)
  - `file_size` (integer)
  - `ocr_text` (text)
  - `ocr_status` (text, e.g. `'pending'`, `'completed'`, `'failed'`, `'skipped'`)
  - `ocr_confidence` (numeric)
  - `ai_extracted_json` (jsonb, holds extracted fields)
  - `ai_status` (text, e.g. `'none'`, `'pending_review'`, `'reviewed'`)
  - `verification_status` (text, e.g. `'pending'`, `'verified'`)
  - `sha256` (text, SHA-256 binary hash for deduplication)
  - `phash` / `dhash` (text, perceptual image hashes)

### 2.10 rti_applications
- Right to Information filing cases.
- **Columns:**
  - `id` (uuid, Primary Key)
  - `case_number` (text, unique)
  - `subject` (text)
  - `description` (text)
  - `status` (text)
  - `filing_date` (date)
  - `reply_due_date` (date)
  - `pio_name` / `pio_designation` (text)
  - `ward_id` (uuid, references `wards.id`, optional)

---

## 3. Custom Functions and Row Level Security (RLS)

### 3.1 Sequence Generation Functions
Case numbers are generated atomic-safely via database functions:
- `next_complaint_case_number(prefix text, year_val integer)`
  - Queries `complaint_counters` table.
  - Locks the row `FOR UPDATE` to prevent race conditions.
  - Increments the counter and formats the string (e.g. `DM-CMP-2026-000015`).

### 3.2 Role-Based Helper Functions
Used in RLS policies to check user rights:
- `can_read(user_id uuid)`
  - Returns `true` if profile exists. All signed-in profiles can view.
- `can_write(user_id uuid, required_roles text[])`
  - Returns `true` if user's role exists in `required_roles`.
- `can_verify(user_id uuid)`
  - Shorthand checking if user's role is `ADMIN`, `EDITOR`, or `VERIFIER`.

### 3.3 RLS Policies Example (Complaints Table)
```sql
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to active complaints"
  ON complaints FOR SELECT
  USING (deleted_at IS NULL AND auth.uid() IS NOT NULL);

CREATE POLICY "Allow write access to authorized roles"
  ON complaints FOR INSERT
  WITH CHECK (
    can_write(auth.uid(), ARRAY['ADMIN', 'EDITOR', 'COMPLAINT_MANAGER'])
  );

CREATE POLICY "Allow update access to authorized roles"
  ON complaints FOR UPDATE
  USING (
    can_write(auth.uid(), ARRAY['ADMIN', 'EDITOR', 'COMPLAINT_MANAGER'])
  );
```

---

## 4. Key Indexes

To keep queries fast during text searches and foreign key resolutions, the migrations create the following indexes:
- `idx_wards_new_no` on `wards(new_no)`
- `idx_wards_eng_sub` on `wards(eng_subdivision_id)`
- `idx_contacts_subdivision` on `contacts(eng_subdivision_id)`
- `idx_complaints_case_number` on `complaints(case_number)`
- `idx_complaints_deleted_at` on `complaints(deleted_at) WHERE deleted_at IS NULL`
- `idx_documents_sha256` on `complaint_documents(sha256)`
- `idx_documents_phash_dhash` on `complaint_documents(phash, dhash)`
- `idx_rti_reply_due` on `rti_applications(reply_due_date)`
