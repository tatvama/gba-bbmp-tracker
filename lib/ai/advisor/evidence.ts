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
  // Kannada text: the advisor panel that surfaces these is shown in Kannada.
  if (actions.length > 0) {
    if (!hasBefore) missing.push("'ಕೆಲಸಕ್ಕೆ ಮೊದಲು' ಸ್ಥಳದ ಫೋಟೋ ದಾಖಲೆಯಲ್ಲಿ ಇಲ್ಲ");
    if (!hasAfter) missing.push("'ಕೆಲಸದ ನಂತರ' ಸ್ಥಳದ ಫೋಟೋ ದಾಖಲೆಯಲ್ಲಿ ಇಲ್ಲ — ವರದಿಯಾದ ಕ್ರಮವನ್ನು ಪರಿಶೀಲಿಸಲು ಅಗತ್ಯ");
  }

  const lowConfidenceScans = documents.filter(
    (d) => typeof d.ocr_confidence === "number" && d.ocr_confidence < 55,
  ).length;
  if (lowConfidenceScans > 0) {
    missing.push(`${lowConfidenceScans} ಸ್ಕ್ಯಾನ್‌ಗಳಲ್ಲಿ OCR ವಿಶ್ವಾಸ ಕಡಿಮೆ ಇದೆ — ಸ್ಪಷ್ಟವಾಗಿ ಮರು-ಸ್ಕ್ಯಾನ್ ಮಾಡಬೇಕಾಗಬಹುದು`);
  }

  return missing;
}
