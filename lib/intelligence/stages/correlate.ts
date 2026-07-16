import { crossDocFieldMismatch, detectRepeatPatterns, type JobPatternRow } from "@/lib/forensics/pattern-detector";
import type { BillFinding } from "@/lib/forensics/types";
import type { RawCaseMaterial } from "./ingest";
import type { Store } from "../builder";
import type { Observation } from "../types";

/**
 * Stage 3 — Correlate & Cross-Verify (deterministic, REUSE). Feeds the existing
 * crossDocFieldMismatch + detectRepeatPatterns engines with per-document identity
 * fields drawn from already-extracted structures, and normalizes the resulting
 * contradictions into evidence-linked correlation Observations.
 */
export function correlateDocuments(material: RawCaseMaterial, store: Store): Observation[] {
  const { billAudits, jobDocs, jobCase } = material;

  // Per-document identity rows for mismatch detection. Only fields that MUST be
  // constant across a work's documents belong here — never per-bill totals
  // (a bill's grandTotal legitimately differs between part bills, and would
  // otherwise raise a spurious "agreement_amount differs" red flag). Mirrors the
  // established mapping in lib/actions/job-audit.ts.
  const rows: Record<string, string | number | null>[] = [];
  for (const ba of billAudits ?? []) {
    const b = (ba.extracted ?? {}) as any;
    rows.push({ contractor: b.contractor ?? null, work_order_amount: b.sanctionedAmount ?? null });
  }
  for (const d of jobDocs) {
    const j = d.aiExtractedJson as any;
    if (j && typeof j === "object" && (j.contractor || j.work)) {
      const c = typeof j.contractor === "object" ? j.contractor : { name: j.contractor };
      rows.push({ contractor: c?.name ?? (typeof j.contractor === "string" ? j.contractor : null), gst: c?.gstin ?? null, pan: c?.pan ?? null, work_name: j.work ?? null });
    }
  }
  if (jobCase) rows.push({ contractor: jobCase.contractor ?? null, work_name: jobCase.description ?? null });

  const mismatches = rows.length >= 2 ? crossDocFieldMismatch(rows) : [];

  // Repeat patterns across jobs (single-job cases usually yield none; still run).
  const patternRows: JobPatternRow[] = jobCase?.job_number
    ? [{ jobNumber: jobCase.job_number as string, contractor: (jobCase.contractor as string) ?? null }]
    : [];
  const patterns = detectRepeatPatterns(patternRows);

  const all: BillFinding[] = [...mismatches, ...patterns];
  return all.map((f) => {
    const evId = store.addEvidence({ sourceTable: "derived", sourceDocId: null, docType: "Cross-document correlation", page: null, extract: f.detail, confidence: "High" });
    return {
      id: store.obsId(),
      code: f.code,
      statement: f.detail || f.title,
      category: "CORRELATION",
      severity: f.severity,
      findingClass: f.findingClass,
      evidenceGrade: f.evidenceGrade,
      confidence: "High",
      evidenceIds: [evId],
      ruleRefs: [],
      officerRefs: [],
      relatedTimelineIds: [],
      relatedDocumentIds: [],
      recordToDemand: f.recordToDemand,
    } as Observation;
  });
}
