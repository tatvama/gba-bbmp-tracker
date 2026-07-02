import type { AdvisorContext } from "./types";

const BEFORE_TYPE = "Site photo before work";
const AFTER_TYPE = "Site photo after work";

/**
 * Deterministic evidence-completeness check — no AI call. Reuses document
 * fields context-builder already fetched (document_type, ocr_confidence,
 * ocr_status) so missing/weak evidence is flagged even when the AI narrative
 * is unavailable or skipped by the context-hash cache.
 */
export function checkEvidenceCompleteness(ctx: AdvisorContext): string[] {
  const missing: string[] = [];
  const { documents, actions } = ctx;

  const hasBefore = documents.some((d) => d.document_type === BEFORE_TYPE);
  const hasAfter = documents.some((d) => d.document_type === AFTER_TYPE);

  // Only expect a before/after pair once work has actually been reported —
  // asking for "after" evidence before any action is taken would be noise.
  if (actions.length > 0) {
    if (!hasBefore) missing.push("No 'before work' site photo on record");
    if (!hasAfter) missing.push("No 'after work' site photo on record — needed to verify the reported action");
  }

  const lowConfidenceScans = documents.filter(
    (d) => typeof d.ocr_confidence === "number" && d.ocr_confidence < 55,
  ).length;
  if (lowConfidenceScans > 0) {
    missing.push(`${lowConfidenceScans} scan(s) have low OCR confidence — may need a clearer re-scan`);
  }

  return missing;
}
