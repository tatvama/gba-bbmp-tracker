/**
 * Shared types for the "forensic ZIP" import (bbmp-bwssb-forensic-audit skill output).
 *
 * The user runs the external skill, which downloads BBMP IFMS documents, OCRs them,
 * runs a forensic audit, and drafts a Kannada complaint letter — producing, PER JOB
 * CODE, an extracted-text file, a minimum-dataset JSON, the letter (DOCX + PDF) and
 * logs. The user ZIPs that output so each top-level folder is named exactly a job
 * code (ddd-yy-nnnnnn) and uploads it here.
 *
 * NOTE: deliberately NO `import "server-only"` — this is a plain types/contract module
 * imported by both server actions and client components (mirrors lib/rti/letter-import.ts).
 */

/** Where a job's parsed dataset came from. */
export type ForensicSource = "json" | "ai-from-letter" | "none";

/** What a file inside a job-code folder is. */
export type ForensicFileRole =
  | "min_json"      // <code>.min.json — the guaranteed minimum dataset
  | "rich_json"     // <code>.json     — analyst-curated rich dataset
  | "text"          // <code>.txt      — combined extracted/OCR text
  | "letter_docx"   // Job_<code>_complaint_*.docx — the drafted complaint letter
  | "letter_pdf"    // Job_<code>_complaint_*.pdf
  | "evidence_csv"  // evidence/annexure index
  | "log"           // <code>.log / batch logs
  | "portal_pdf"    // original IFMS source PDF (WO-*, WB-*, BA-*, Pmc-*)
  | "info"          // info.txt
  | "other";

export interface DetectedFile {
  /** Path within the job-code folder (no leading folder, forward slashes). */
  relPath: string;
  fileName: string;
  ext: string;
  size: number;
  role: ForensicFileRole;
  /** Canonical document type (for portal_pdf, via mapPortalFileToDocType). */
  docType: string;
  isBlankTemplate: boolean;
}

// ── Minimum-dataset shape (matches assets/minimum_dataset.schema.json) ─────────
// Everything optional: the importer must tolerate partial/missing data.

export interface ForensicContractor {
  name?: string;
  class?: string;
  gstin?: string;
  pan?: string;
}
export interface ForensicSanction {
  number?: string;
  date?: string;
  amount?: string;
}
export interface ForensicAgreement {
  number?: string;
  date?: string;
  value?: string;
  percent_above_sr?: string;
}
export interface ForensicPaymentRow {
  bill?: string;
  date?: string;
  gross?: string;
  deduct?: string;
  net?: string;
  cum?: string;
}
export interface ForensicQuantityRow {
  item?: string;
  desc?: string;
  sr?: string;
  orig?: string;
  mod?: string;
  billed?: string;
  rate?: string;
  amount?: string;
  pct?: string;
}
export interface ForensicChronologyRow {
  event?: string;
  date?: string;
}
export interface ForensicLossComponent {
  category?: string;
  formula?: string;
  inputs?: string;
  amount?: number;
  confidence?: "low" | "medium" | "high";
  record?: string;
}

export type ForensicRiskColour = "Green" | "Amber" | "Orange" | "Red" | "Purple";

export interface ForensicDataset {
  code?: string;
  org?: string;
  work?: string;
  wards?: string;
  zone?: string;
  division?: string;
  sub_division?: string;
  sr_year?: string;
  contractor?: ForensicContractor;
  estimate_cost?: string;
  administrative_sanction?: ForensicSanction;
  technical_sanction?: ForensicSanction;
  agreement?: ForensicAgreement;
  work_order?: { number?: string; date?: string };
  cbr?: string;
  rtgs?: string;
  bill_ids?: string;
  payment_rows?: ForensicPaymentRow[];
  quantity_rows?: ForensicQuantityRow[];
  chronology?: ForensicChronologyRow[];
  document_presence?: Record<string, string>;
  blank_form_files?: string[];
  loss_components?: ForensicLossComponent[];
  loss_line?: string;
  treasury_loss_total?: string;
  misleading_summary?: string | string[];
  overall_risk?: ForensicRiskColour;
  summary?: string;
  caveats?: string;
}

/** Per-job result after analyze; reviewed by the user, then committed. */
export interface ForensicJobResult {
  jobCode: string;          // folder name (raw)
  validCode: boolean;       // matches ^\d{3}-\d{2}-\d{6}$
  files: DetectedFile[];
  missing: string[];        // human labels of expected-but-absent pieces
  warnings: string[];
  source: ForensicSource;
  dataset: ForensicDataset | null;
  letterText: string;       // text of the drafted letter (DOCX/PDF/derived), capped
  extractedText: string;    // OCR/extracted text (<code>.txt), capped
  letterFileRel: string | null; // relPath of the letter DOCX (canonical print artifact)
  letterPdfRel: string | null;
  riskColour: ForensicRiskColour | null;
  skip: boolean;            // user toggle in review (default true if !validCode)
  alreadyImported?: boolean; // job_number already exists in job_cases
}

export type ForensicImportStatus = "Processing" | "Ready" | "Committed" | "Failed";

/** Envelope returned by the analyze/poll actions and consumed by the import UI. */
export interface ForensicImportBatch {
  success?: boolean;
  error?: string;
  batchId?: string;
  status?: ForensicImportStatus;
  storagePath?: string;
  folderCount?: number;
  jobs?: ForensicJobResult[];
  createdCaseIds?: string[];
  createdComplaintIds?: string[];
}

export interface CommitForensicResult {
  success?: boolean;
  error?: string;
  perJob?: { jobCode: string; jobCaseId?: string; complaintId?: string; error?: string }[];
  createdComplaintIds?: string[];
}
