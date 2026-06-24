# API & Server Actions Reference: GBA · BBMP Ward & Engineer Tracker

The platform exposes select HTTP REST endpoints for multipart uploads, document generation, and cron triggers. All other mutations and data creations are handled via Next.js Server Actions.

---

## 1. HTTP REST Endpoints

### 1.1 Document Upload API
- **Endpoint:** `POST /api/complaints/[id]/documents/upload`
- **Description:** Uploads a file to a specific complaint and schedules an asynchronous OCR extraction job.
- **Content-Type:** `multipart/form-data`
- **Request Body:**
  - `file`: Binary file payload (e.g. PDF, PNG, JPEG). Max size: 15MB.
- **Headers:** Includes valid session cookie.
- **Response (200 OK):**
  ```json
  {
    "ok": true,
    "documentId": "48b61c56-8a03-4c91-9e7f-64219b22a01f",
    "ocrStatus": "pending",
    "aiConfigured": true
  }
  ```

### 1.2 OCR Trigger API
- **Endpoint:** `POST /api/complaints/documents/[documentId]/run-ocr`
- **Description:** Manually triggers or re-runs image preprocessing and Tesseract OCR text extraction on an uploaded document.
- **Headers:** Authorized session cookie (requires `ADMIN`, `EDITOR`, or `COMPLAINT_MANAGER` role).
- **Response (200 OK):**
  ```json
  {
    "ok": true,
    "status": "completed"
  }
  ```

### 1.3 AI Analyzer API
- **Endpoint:** `POST /api/complaints/documents/[documentId]/analyze`
- **Description:** Runs Claude AI information extraction over the OCR text to suggest structured complaint fields (location, priority, type, description).
- **Headers:** Authorized session cookie (requires `ADMIN`, `EDITOR`, or `COMPLAINT_MANAGER`).
- **Response (200 OK):**
  ```json
  {
    "ok": true,
    "extraction": {
      "complaint_type": "Road",
      "priority": "High",
      "location": "Vasanth Nagar Main Road",
      "description": "Large potholes near the metro station.",
      "confidence": 0.88
    }
  }
  ```

### 1.4 Road-Work Financial Audit API
- **Endpoint:** `POST /api/road-work/analyze-bill`
- **Description:** Direct upload route for road-work estimate, tender, or MB documents. Returns raw OCR text and a list of deterministic audit findings without storing any data in the database.
- **Content-Type:** `multipart/form-data`
- **Request Body:**
  - `file`: Document file.
  - `documentType`: String (e.g. `'MB_BOOK'`, `'TENDER'`).
- **Response (200 OK):**
  ```json
  {
    "ok": true,
    "ocrStatus": "completed",
    "ocrText": "...",
    "audit": [
      { "rule": "Quantity Variation Check", "passed": false, "details": "Quantity exceeds 125% limit" }
    ]
  }
  ```

### 1.5 Scheduled Notifications Cron
- **Endpoint:** `GET /api/cron/notifications`
- **Description:** Triggers system calculation for overdue RTIs, complaints, and due reminders. Post-processes notifications and logs triggers.
- **Query Parameter:** `?secret=<CRON_SECRET>` or Header `x-cron-secret`.
- **Response (200 OK):**
  ```json
  {
    "ok": true,
    "notifiedCount": 4,
    "digest": { "overdueRtireminders": 2, "overdueComplaintReminders": 2 }
  }
  ```

---

## 2. Server Actions

Mutations are executed as React Server Actions located in `lib/actions/`. These actions check credentials, validate models, write data, log audits, and trigger route cache invalidation.

### 2.1 Complaint Actions (`lib/actions/complaints.ts`)
- `createComplaint(formData: FormData): Promise<ActionResult>`
- `updateComplaint(id: string, formData: FormData): Promise<ActionResult>`
- `deleteComplaint(id: string): Promise<ActionResult>`
- `applyDocumentExtraction(documentId: string, payload: any): Promise<ActionResult>`
  - Merges AI-extracted parameters into the parent complaint and updates its verification status.

### 2.2 RTI Actions (`lib/actions/rti.ts`)
- `createRtiApplication(formData: FormData): Promise<ActionResult>`
- `updateRtiApplication(id: string, formData: FormData): Promise<ActionResult>`
- `generateRtiDraft(applicationId: string, groundType: string, tone: string): Promise<{ draftText: string }>`
  - Constructs legal grounds and triggers the Claude prompt pipeline.
- `analyzeRtiReply(applicationId: string, replyText: string): Promise<ActionResult>`

### 2.3 Contact Actions (`lib/actions/contacts.ts`)
- `createContact(formData: FormData): Promise<ActionResult>`
- `updateContact(id: string, formData: FormData): Promise<ActionResult>`
- `verifyContact(id: string, status: string, confidence: string): Promise<ActionResult>`
