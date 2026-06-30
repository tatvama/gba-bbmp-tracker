/**
 * Shared types for the multi-letter RTI import flow (one uploaded PDF that holds
 * several distinct RTI letters → one case per letter). These live in a plain
 * (non-"use server") module so both the server actions in lib/actions/rti.ts and
 * the client UI can import them — a "use server" file may only export functions.
 */

/** One letter detected inside a multi-letter PDF (AI output, page-range + fields). */
export interface DetectedLetter {
  /** 1-indexed, inclusive. */
  startPage: number;
  /** 1-indexed, inclusive. */
  endPage: number;
  subject: string | null;
  authority: string | null;
  category: string | null;
  referenceNumber: string | null;
  /** Public Information Officer named/addressed on the letter, if found. */
  pioName: string | null;
  pioDesignation: string | null;
  /** ISO date (YYYY-MM-DD) printed on the letter, if found. */
  documentDate: string | null;
}

/** A detected letter plus the OCR text sliced to its page range (for review/commit). */
export interface AnalyzedLetter extends DetectedLetter {
  ocrText: string;
}

/** Result of analysing an uploaded office-copy PDF (before any case is created). */
export interface AnalyzeRtiResult {
  success?: boolean;
  error?: string;
  /** Storage path of the merged PDF held for the commit step. */
  storagePath?: string;
  pageCount?: number;
  letters?: AnalyzedLetter[];
}

/** A (possibly user-edited) letter to turn into its own RTI case. */
export interface CommitLetterInput {
  startPage: number;
  endPage: number;
  subject: string;
  ocrText?: string;
  authority?: string | null;
  category?: string | null;
  referenceNumber?: string | null;
  pioName?: string | null;
  pioDesignation?: string | null;
  documentDate?: string | null;
}

export interface CommitRtiLettersResult {
  success?: boolean;
  error?: string;
  /** IDs of the RTI cases created, in order. */
  createdIds?: string[];
  primaryId?: string;
}

/** Lifecycle of a background office-copy import job (rti_import_batches). */
export type RtiImportStatus = "Processing" | "Ready" | "Committed" | "Failed";

/** Result of starting a background import — the job id to poll/resume on. */
export interface StartRtiImportResult {
  success?: boolean;
  error?: string;
  batchId?: string;
}

/** Snapshot of a background import job, polled by the client (and after refresh). */
export interface RtiImportBatch {
  success?: boolean;
  error?: string;
  batchId?: string;
  status?: RtiImportStatus;
  storagePath?: string;
  pageCount?: number;
  letters?: AnalyzedLetter[];
  createdIds?: string[];
}
