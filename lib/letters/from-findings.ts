/** Pure mapping: forensic BillFinding → Kannada LetterFinding (shared by the
 *  server action and the MCP server). Keeps the safe-language framing in one place. */
import type { BillFinding } from "@/lib/forensics/types";
import type { LetterFinding } from "./types";
import { STATUTE_MAP } from "./letter-knowledge";

const PREFIX_RE = /^[A-Z]+/;

export function mapBillFindingToLetter(f: BillFinding): LetterFinding {
  const prefix = PREFIX_RE.exec(f.code.toUpperCase())?.[0] ?? "";
  const cls = f.findingClass;
  let mismatch: string | undefined;
  if (cls === "confirmed_mismatch") {
    mismatch = f.expected && f.actual ? `Recorded ${f.actual}; expected ${f.expected}.` : "A conflicting record is on file.";
  } else if (cls === "missing_proof") {
    mismatch = "The mandatory supporting record was not found in the supplied documents.";
  } else if (f.expected && f.actual) {
    mismatch = `Recorded ${f.actual}; expected ${f.expected}.`;
  }
  const docRef = f.sourceDocId
    ? `ಅಪ್‌ಲೋಡ್ ಮಾಡಿದ ದಾಖಲೆ (ref ${String(f.sourceDocId).slice(0, 8)})`
    : `${(f.category ?? "RECORD").toString().replace(/_/g, " ")} record on file`;
  return {
    code: f.code,
    title: f.title,
    severity: f.severity,
    docRef,
    observation: f.detail,
    mismatch,
    suspicionReason: f.safeText ?? f.detail,
    workedExample: f.workedExample,
    ruleBasis: f.ruleRef ?? STATUTE_MAP[prefix] ?? "KW-4 agreement & PWD Code",
    recordDemand: f.recordToDemand ?? "Relevant original records and certifications",
    evidenceGrade: f.evidenceGrade,
    riskScore: f.riskPoints,
  };
}
