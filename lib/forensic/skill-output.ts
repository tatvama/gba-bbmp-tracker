/**
 * Shared types for the "forensic ZIP" import (bbmp-bwssb-forensic-audit skill output).
 *
 * REAL export layout (one batch per ZIP, possibly several batches):
 *   batch_<W..>/
 *     <ddd-yy-nnnnnn>/                 ← job-code folder: SOURCE docs (WO-*, info.txt)
 *     _AUDIT_OUTPUT/
 *       data/<code>.json               ← rich forensic dataset (the authoritative one)
 *       work/<code>.min.json           ← skeleton (fallback only)
 *       work/<code>.txt                ← extracted/OCR text
 *       letters/Job_<code>_complaint_KN.docx + .pdf   ← drafted letter
 *       work/{_batch*.json,_work_split.json,ocrsafe_cache/} ← batch noise (ignored)
 *
 * So a job's files are spread across the job folder AND the shared _AUDIT_OUTPUT.
 * We therefore key everything off the job code found in each entry's path.
 *
 * NOTE: no `import "server-only"` — imported by client components too (types only).
 */

export type ForensicSource = "json" | "ai-from-letter" | "none";

export type ForensicFileRole =
  | "rich_json"     // _AUDIT_OUTPUT/data/<code>.json — authoritative dataset
  | "min_json"      // _AUDIT_OUTPUT/work/<code>.min.json — skeleton fallback
  | "text"          // <code>.txt — combined extracted/OCR text
  | "letter_docx"   // Job_<code>_complaint_*.docx
  | "letter_pdf"    // Job_<code>_complaint_*.pdf
  | "evidence_csv"
  | "log"
  | "portal_pdf"    // a source document (WO-*, WB-*, …) or site photo
  | "info"          // info.txt
  | "other";        // placeholders (WO-*-NA.jpg), batch logs, ocr cache — ignored

export interface DetectedFile {
  relPath: string;   // full path within the ZIP
  fileName: string;  // basename
  ext: string;
  size: number;
  role: ForensicFileRole;
  docType: string;   // for portal_pdf, via mapPortalFileToDocType
  isBlankTemplate: boolean;
}

export type ForensicRiskColour = "Green" | "Amber" | "Orange" | "Red" | "Purple";

/** A forensic ground (finding) from the rich data/<code>.json. */
export interface ForensicGround {
  title?: string;
  doc_ref?: string;
  observed?: string;
  mismatch?: string;
  reason?: string;
  example?: string;
  law?: string;
  demand?: string;
  officer?: string;
  evidence?: string;
  risk?: string; // Red | Orange | Amber | Green (sometimes free text)
}

/** Payment/amount row — real shape {item,amount,source}; legacy keys tolerated. */
export interface ForensicPaymentRow {
  item?: string;
  amount?: string;
  source?: string;
  bill?: string;
  date?: string;
  gross?: string;
  deduct?: string;
  net?: string;
  cum?: string;
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

/** The forensic dataset (rich data/<code>.json; tolerant of the skeleton min.json). */
export interface ForensicDataset {
  code?: string;
  org?: string;
  work?: string;
  wards?: string;
  zone?: string;
  division?: string;
  sub_division?: string;
  place?: string;
  letter_date?: string;
  /** Real export uses a string; legacy schema used an object. */
  contractor?: string | { name?: string; class?: string; gstin?: string; pan?: string };
  identity_rows?: { label?: string; value?: string }[];
  payment_rows?: ForensicPaymentRow[];
  quantity_rows?: Record<string, unknown>[];
  chronology?: ForensicChronologyRow[];
  grounds?: ForensicGround[];
  documents_demanded?: (string | { label?: string; demand?: string })[];
  treasury_loss_total?: string;
  /** Raw risk text (e.g. "ಹೆಚ್ಚು ಅಪಾಯ / Red"); parse the colour with parseRiskColour. */
  overall_risk?: string;
  loss_line?: string;
  misleading_summary?: string | string[];
  summary?: string;
  caveats?: string;
  /** Legacy minimum-dataset fields (still accepted). */
  loss_components?: ForensicLossComponent[];
  document_presence?: Record<string, unknown>;
  bill_ids?: string;
}

/** Per-job result after analyze; reviewed by the user, then committed. */
export interface ForensicJobResult {
  jobCode: string;
  validCode: boolean;
  files: DetectedFile[];     // all entries belonging to this job code (full relPaths)
  missing: string[];
  warnings: string[];
  source: ForensicSource;
  dataset: ForensicDataset | null;
  letterText: string;
  extractedText: string;
  letterFileRel: string | null;
  letterPdfRel: string | null;
  riskColour: ForensicRiskColour | null;
  skip: boolean;
  alreadyImported?: boolean;
}

export type ForensicImportStatus = "Processing" | "Ready" | "Committed" | "Failed";

export interface ForensicImportBatch {
  success?: boolean;
  error?: string;
  batchId?: string;
  status?: ForensicImportStatus;
  /** Local temp-directory path the ZIP was extracted into (not object storage). */
  extractDir?: string;
  folderCount?: number; // number of job codes found
  jobs?: ForensicJobResult[];
  createdCaseIds?: string[];
  createdComplaintIds?: string[];
}

export interface CommitForensicFileFailure {
  fileName: string;
  error: string;
}

export interface CommitForensicSummary {
  totalFiles: number;
  uploaded: number;
  failed: number;
  skipped: number;
  durationMs: number;
}

export interface CommitForensicResult {
  success?: boolean;
  error?: string;
  perJob?: {
    jobCode: string;
    jobCaseId?: string;
    complaintId?: string;
    error?: string;
    filesTotal?: number;
    filesUploaded?: number;
    filesFailed?: CommitForensicFileFailure[];
  }[];
  createdComplaintIds?: string[];
  summary?: CommitForensicSummary;
}
