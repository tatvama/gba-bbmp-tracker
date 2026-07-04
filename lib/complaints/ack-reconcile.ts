/**
 * Shared types for bulk ACKNOWLEDGMENT RECONCILIATION — one uploaded scanned PDF
 * of many BBMP acknowledgments (mixed order, variable page counts) → each section
 * matched to an EXISTING complaint and attached as proof of receipt.
 *
 * Plain (non-"use server") module so BOTH the server actions in
 * lib/actions/ack-import.ts and the client review UI can import these types.
 */
import type { ComplaintIntakeExtraction } from "@/lib/ai/complaint-intake-analyzer";

export type MatchConfidence = "high" | "medium" | "low" | "none";
export type AckDecision = "pending" | "confirmed" | "skipped" | "committed";
export type AckBatchStatus = "processing" | "review" | "committing" | "committed" | "failed";

/** Deterministic R2 key for a page thumbnail — shared by the runner (which writes
 *  them) and the review actions (which re-derive them after a boundary edit). */
export function ackThumbKey(batchId: string, page: number): string {
  return `ack-thumbs/${batchId}/p${String(page).padStart(4, "0")}.jpg`;
}

/** A candidate EXISTING complaint an acknowledgment section might belong to. */
export interface MatchCandidate {
  complaintId: string;
  caseNumber: string | null; // internal_case_number (DM-CMP-…)
  complaintNumber: string | null; // BBMP / portal complaint number
  jobNumber: string | null; // ddd-yy-nnnnnn
  title: string | null;
  location: string | null;
  status: string | null;
  /** 0..1 blended match score. */
  score: number;
  /** Human-readable reasons ("Exact job code 001-24-000014", "Subject 88% match"). */
  reasons: string[];
}

/** Result of matching one extracted acknowledgment against the complaint pool. */
export interface AckMatchResult {
  proposedComplaintId: string | null;
  confidence: MatchConfidence;
  candidates: MatchCandidate[];
}

/** Compact complaint summary shown against a section (proposed + assigned). */
export interface ComplaintSummary {
  id: string;
  caseNumber: string | null;
  complaintNumber: string | null;
  jobNumber: string | null;
  title: string | null;
  location: string | null;
  status: string | null;
}

/** One acknowledgment section as delivered to the review client. */
export interface AckReviewItem {
  id: string;
  sortOrder: number;
  pageStart: number;
  pageEnd: number;
  extracted: Partial<ComplaintIntakeExtraction> & Record<string, unknown>;
  /** Signed URLs of the per-page thumbnails, in page order (for the page-strip). */
  thumbUrls: string[];
  proposedComplaintId: string | null;
  matchConfidence: MatchConfidence;
  candidates: MatchCandidate[];
  assignedComplaintId: string | null;
  decision: AckDecision;
  attachedDocumentId: string | null;
  /** Resolved summaries so the UI can render without a second round-trip. */
  proposed: ComplaintSummary | null;
  assigned: ComplaintSummary | null;
  ocrText?: string | null;
}

/** The whole batch as the review page sees it. */
export interface AckBatchView {
  id: string;
  status: AckBatchStatus;
  stage: string | null;
  message: string | null;
  error: string | null;
  originalName: string | null;
  pageCount: number;
  processedPages: number;
  items: AckReviewItem[];
}

/** Compact batch row for the acknowledgments index page. */
export interface AckBatchListRow {
  id: string;
  status: AckBatchStatus;
  originalName: string | null;
  pageCount: number;
  itemCount: number;
  committedCount: number;
  createdAt: string;
}

/** Live progress shape returned by the processing poll endpoint. */
export interface AckBatchProgress {
  status: AckBatchStatus;
  stage: string | null;
  message: string | null;
  error: string | null;
  pageCount: number;
  processedPages: number;
  itemCount: number;
}
