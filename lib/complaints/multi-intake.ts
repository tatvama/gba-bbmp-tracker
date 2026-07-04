/**
 * Shared types for the multi-complaint intake flow (one uploaded PDF that may
 * hold several distinct complaint letters → one complaint per letter). Kept in a
 * plain (non-"use server") module so BOTH the server actions in
 * lib/actions/complaint-intake.ts and the client review UI can import them — a
 * "use server" file may only export async functions.
 */
import type { ComplaintIntakeExtraction } from "@/lib/ai/complaint-intake-analyzer";

/** One complaint letter detected inside an uploaded PDF, with its own extraction. */
export interface DetectedComplaint {
  /** 1-indexed, inclusive page range in the original combined upload. */
  pageStart: number;
  pageEnd: number;
  /** OCR text sliced to this letter's pages. */
  ocrText: string;
  /** Independent AI extraction for just this letter. */
  extraction: ComplaintIntakeExtraction;
}

/** Result of analysing an uploaded PDF (before any complaint is created). */
export interface IntakeAnalyzeResult {
  success?: boolean;
  error?: string;
  /** R2 key of the merged original PDF, held for the commit step + preserved. */
  storagePath?: string;
  /** Display name of the original upload. */
  originalName?: string;
  pageCount?: number;
  /** One entry per detected complaint (a single-letter PDF yields exactly one). */
  complaints?: DetectedComplaint[];
}

/** A (possibly user-edited) detected complaint to turn into its own record. */
export interface CommitComplaint {
  pageStart: number;
  pageEnd: number;
  ocrText?: string;
  extraction: ComplaintIntakeExtraction;
}

export interface CreatedComplaintSummary {
  complaintId: string;
  caseNumber: string;
  subject: string;
  pageStart: number;
  pageEnd: number;
}

export interface IntakeCommitResult {
  success?: boolean;
  error?: string;
  /** The complaints created, in order — drives the "Total created: N" feedback. */
  created?: CreatedComplaintSummary[];
}
