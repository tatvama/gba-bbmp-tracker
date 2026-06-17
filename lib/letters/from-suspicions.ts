/**
 * Map ticked 180-bank suspicions → LetterFinding[] for the deterministic letter
 * skeleton (the safe fallback when the AI draft trips the linter, and the source
 * of the summary box / grounds / evidence index / officer-responsibility table).
 *
 * Pure — safe for web + MCP. Every finding is framed as a suspicion (ಶಂಕೆ).
 */
import { ROAD_WORK_180_BY_CODE } from "@/lib/ai/road-work-questions";
import type { Severity180 } from "@/lib/ai/road-work-knowledge";
import type { LetterFinding, FlagSummary } from "./types";

/** Per-section metadata: a duty-prefix (so the officer-responsibility table groups
 *  sensibly), a responsible officer, and a default evidence grade (A–E). */
const SECTION_META: Record<
  string,
  { prefix: string; officer: string; grade: "A" | "B" | "C" | "D" | "E" }
> = {
  S1: { prefix: "ARITH", officer: "Assistant Engineer (AE) / Assistant Executive Engineer (AEE)", grade: "B" },
  S2: { prefix: "EXCESS", officer: "Assistant Executive Engineer (AEE) / Executive Engineer (EE)", grade: "B" },
  S3: { prefix: "HIDDEN", officer: "Assistant Engineer (AE) — measurement", grade: "E" },
  S4: { prefix: "CH", officer: "Executive Engineer (EE) — sanction & location", grade: "A" },
  S5: { prefix: "HIDDEN", officer: "Assistant Engineer (AE) / Assistant Executive Engineer (AEE)", grade: "E" },
  S6: { prefix: "CH", officer: "Executive Engineer (EE) — penalty levy", grade: "B" },
  S7: { prefix: "MB", officer: "Assistant Engineer (AE) / Assistant Executive Engineer (AEE)", grade: "C" },
  S8: { prefix: "SAL", officer: "Assistant Engineer (AE) — store & disposal", grade: "C" },
  S9: { prefix: "EL", officer: "Tender Inviting / Accepting Authority", grade: "C" },
  S10: { prefix: "IN", officer: "Executive Engineer (EE) / Accounts", grade: "C" },
  S11: { prefix: "PHOTO", officer: "Assistant Engineer (AE) — geo-tag upload", grade: "E" },
  S12: { prefix: "CH", officer: "Executive Engineer (EE) — road-cutting permission", grade: "C" },
  S13: { prefix: "DISP", officer: "Executive Engineer (EE) / Environmental cell", grade: "C" },
  S14: { prefix: "ROY", officer: "Assistant Engineer (AE) — material reconciliation", grade: "C" },
  S15: { prefix: "MB", officer: "Assistant Engineer (AE) / Assistant Executive Engineer (AEE) / Executive Engineer (EE)", grade: "B" },
  S16: { prefix: "CH", officer: "Assistant Executive Engineer (AEE) / Executive Engineer (EE) — certification", grade: "C" },
  S17: { prefix: "DD", officer: "Executive Engineer (EE) / Drawing & Disbursing Officer", grade: "B" },
};

/** Codes whose nature warrants a stronger grade than their section default. */
const GRADE_OVERRIDE: Record<string, "A" | "B" | "C" | "D" | "E"> = {
  Q78: "D", // blank-signed form
  Q80: "D", // signature mismatch
  Q119: "D", // photo tampering
  Q122: "D", // recycled photos
};

const SEV_TO_LETTER: Record<Severity180, "High" | "Medium" | "Low"> = {
  RED: "High",
  ORANGE: "Medium",
  AMBER: "Low",
};
const SEV_TO_SCORE: Record<Severity180, number> = { RED: 80, ORANGE: 50, AMBER: 25 };

export interface SuspicionInput {
  codes: string[];
  /** Optional per-code observation note from the reviewer. */
  notes?: Record<string, string>;
  /** Drives whether suspicion text is rendered in Kannada (default) or English. */
  language?: "Kannada" | "Bilingual" | "English";
}

/** Build LetterFinding[] from ticked suspicion codes. */
export function suspicionsToFindings(input: SuspicionInput): LetterFinding[] {
  const language = input.language ?? "Kannada";
  const findings: LetterFinding[] = [];

  for (const code of input.codes) {
    const entry = ROAD_WORK_180_BY_CODE[code];
    if (!entry) continue;
    const { section, question } = entry;
    const meta = SECTION_META[section.id] ?? { prefix: "MB", officer: "Executive Engineer (EE)", grade: "C" as const };
    const note = (input.notes?.[code] ?? "").trim();
    const reason = language === "English" ? question.en : question.kn;

    findings.push({
      code: `${meta.prefix}-${question.code}`,
      title: `${question.code} · ${section.titleEn}`,
      severity: SEV_TO_LETTER[question.severity],
      docRef: `ಕಾಮಗಾರಿ ಕಡತ / ಎಂ.ಬಿ / ಬಿಲ್ (${section.id})`,
      observation: note || "ಪರಿಶೀಲನೆಗೆ ಬಾಕಿ — ಮೂಲ ದಾಖಲೆ ಅಗತ್ಯವಿದೆ.",
      suspicionReason: reason,
      ruleBasis: section.legalBasis,
      recordDemand: `${section.titleKn} ಸಂಬಂಧಿತ ಮೂಲ ದಾಖಲೆಗಳ ಪ್ರಮಾಣೀಕೃತ ನಕಲುಗಳನ್ನು ಹಾಜರುಪಡಿಸಬೇಕು.`,
      responsibleOfficer: meta.officer,
      evidenceGrade: GRADE_OVERRIDE[code] ?? meta.grade,
      riskScore: SEV_TO_SCORE[question.severity],
    });
  }

  // Highest risk first, so the most serious grounds lead.
  return findings.sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0));
}

/** Tally RED / ORANGE / AMBER across a set of codes. */
export function flagSummaryForCodes(codes: string[]): FlagSummary {
  const out: FlagSummary = { red: 0, orange: 0, amber: 0 };
  for (const code of codes) {
    const entry = ROAD_WORK_180_BY_CODE[code];
    if (!entry) continue;
    if (entry.question.severity === "RED") out.red += 1;
    else if (entry.question.severity === "ORANGE") out.orange += 1;
    else out.amber += 1;
  }
  return out;
}
