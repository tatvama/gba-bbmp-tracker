/**
 * Static knowledge for the letter generator: Kannada evidence-block labels,
 * statute / ruling maps, and the safe-language vocabulary. Pure data — no I/O.
 *
 * SAFETY: this file encodes the "documented suspicion, never accusation" rule of
 * the bbmp-bill-audit skill. The linter (safe-language.ts) HARD-FAILS any draft
 * containing the UNSAFE_PATTERNS so prohibited accusatory wording can never ship.
 */

/** The 7 mandatory labels every serious ground must carry, in order. */
export const GROUND_LABELS_KN_REQUIRED = [
  "ದಾಖಲೆ ಆಧಾರ", // document reference (Annexure / page / item)
  "ಕಂಡುಬಂದ ಅಂಶ", // observed fact (exact figure)
  "ಮಿಸ್‌ಮ್ಯಾಚ್ ಅಥವಾ ಕೊರತೆ", // mismatch or missing proof
  "ಸಂದೇಹಕ್ಕೆ ಕಾರಣ", // reason for doubt
  "ನಿಯಮ ಅಥವಾ ಕಾನೂನು ಆಧಾರ", // rule / statutory basis
  "ಬೇಕಾಗಿರುವ ದಾಖಲೆ", // record to be produced
  "ಜವಾಬ್ದಾರಿ ಸ್ಪಷ್ಟನೆ ನೀಡಬೇಕಾದವರು", // officer who must clarify
] as const;

/** Optional enrichment labels (worked example first — required for High grounds). */
export const GROUND_LABELS_KN_OPTIONAL = [
  "ಸರಳ ಉದಾಹರಣೆ", // worked example
  "ಸಾಕ್ಷ್ಯ ಬಲ", // evidence strength (grade A–E)
  "ಅಪಾಯ ಅಂಕ", // risk score
] as const;

export type GroundLabelKey =
  | (typeof GROUND_LABELS_KN_REQUIRED)[number]
  | (typeof GROUND_LABELS_KN_OPTIONAL)[number];

/** Map a LetterFinding field to its Kannada label + a style key for DOCX. */
export const GROUND_FIELD_LABELS: Array<{ field: string; label: string; styleKey: string; optional?: boolean }> = [
  { field: "docRef", label: "ದಾಖಲೆ ಆಧಾರ", styleKey: "ground_doc" },
  { field: "observation", label: "ಕಂಡುಬಂದ ಅಂಶ", styleKey: "ground_fact" },
  { field: "mismatch", label: "ಮಿಸ್‌ಮ್ಯಾಚ್ ಅಥವಾ ಕೊರತೆ", styleKey: "ground_mismatch" },
  { field: "suspicionReason", label: "ಸಂದೇಹಕ್ಕೆ ಕಾರಣ", styleKey: "ground_reason" },
  { field: "ruleBasis", label: "ನಿಯಮ ಅಥವಾ ಕಾನೂನು ಆಧಾರ", styleKey: "ground_rule" },
  { field: "recordDemand", label: "ಬೇಕಾಗಿರುವ ದಾಖಲೆ", styleKey: "ground_record" },
  { field: "responsibleOfficer", label: "ಜವಾಬ್ದಾರಿ ಸ್ಪಷ್ಟನೆ ನೀಡಬೇಕಾದವರು", styleKey: "ground_officer" },
  { field: "workedExample", label: "ಸರಳ ಉದಾಹರಣೆ", styleKey: "ground_example", optional: true },
  { field: "evidenceGrade", label: "ಸಾಕ್ಷ್ಯ ಬಲ", styleKey: "ground_grade", optional: true },
  { field: "riskScore", label: "ಅಪಾಯ ಅಂಕ", styleKey: "ground_risk", optional: true },
];

/** Dash / hyphen family that must NOT appear in Kannada prose (only in official IDs). */
export const DASH_CHARS = ["‐", "‑", "‒", "–", "—", "―", "−"] as const;

/**
 * Hard-prohibited accusatory phrasing. Presence of ANY of these in a draft is a
 * lint failure (the AI text is discarded). 4 English + 4 Kannada.
 */
export const UNSAFE_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\bcommitted (?:fraud|forgery|theft|corruption|cheating)\b/i, reason: "direct accusation of a crime" },
  { re: /\b(?:is|are|was|were)\s+(?:corrupt|fraudulent|a fraud|guilty)\b/i, reason: "imputes guilt" },
  { re: /\b(?:embezzled|misappropriated|stole|forged|bribed|took (?:a )?bribe)\b/i, reason: "asserts a crime as fact" },
  { re: /\b(?:has|have)\s+(?:siphoned|swindled|looted)\b/i, reason: "asserts a crime as fact" },
  { re: /ಭ್ರಷ್ಟಾಚಾರ\s*ಮಾಡಿದ್ದಾರೆ/, reason: "asserts corruption as fact (Kannada)" },
  { re: /ಮೋಸ\s*ಮಾಡಿದ್ದಾರೆ/, reason: "asserts cheating as fact (Kannada)" },
  { re: /ಕಳವು\s*ಮಾಡಿದ್ದಾರೆ/, reason: "asserts theft as fact (Kannada)" },
  { re: /ಲಂಚ\s*ತೆಗೆದುಕೊಂಡಿದ್ದಾರೆ/, reason: "asserts bribery as fact (Kannada)" },
];

/** Identifier shapes that ARE allowed to contain dashes (whitelisted before the dash check). */
export const IDENTIFIER_MASKS: RegExp[] = [
  /\b\d{2,4}-\d{2,4}-\d{2,8}\b/g, // job / work code e.g. 222-12-345678
  /\b(?:Reg|KARKAN|GST|PAN|TIN)[A-Z]*[./-]?\s?[A-Z0-9./-]{4,}\b/gi, // registration / GST / PAN
  /\b(?:AIR|SCC|SCR|ILR|KLJ)\s?\(?\d{0,4}\)?\s?[A-Za-z]*\s?\d{1,4}\b/g, // law-report citations
];

/**
 * Accusatory → cautious replacements applied to AI prose before linting.
 * Each turns a verdict into a documented suspicion requiring records.
 */
export const SAFE_REPLACEMENTS: Array<{ re: RegExp; to: string }> = [
  { re: /\bfraud(?:ulent)?\b/gi, to: "apparent irregularity requiring explanation" },
  { re: /\bforged\b/gi, to: "appears not to be original and requires expert verification" },
  { re: /\bfake\b/gi, to: "of doubtful authenticity, requiring verification" },
  { re: /\bcorrupt(?:ion)?\b/gi, to: "matter requiring vigilance scrutiny" },
  { re: /\bembezzl\w*\b/gi, to: "apparent excess payment requiring recovery scrutiny" },
  { re: /\bmisappropriat\w*\b/gi, to: "apparent unaccounted amount requiring explanation" },
  { re: /\bstolen|stole\b/gi, to: "apparently unaccounted, requiring records" },
  { re: /\bbribe\w*\b/gi, to: "matter requiring vigilance scrutiny" },
  { re: /\bguilty\b/gi, to: "answerable, pending explanation" },
  { re: /\bproves?\b/gi, to: "appears to indicate" },
  { re: /\bclearly shows?\b/gi, to: "appears to show" },
];

/** Finding-code prefix → statutory / rule basis (filled into ground "rule" label). */
export const STATUTE_MAP: Record<string, string> = {
  ARITH: "PWD Code & KW-4 agreement payment clauses",
  EXCESS: "KTPP Act 1999 & Schedule-B / variation-limit clauses",
  QT: "PWD Code quantity-variation limit (≤125% per item; overall cap)",
  RATE: "KPWD Schedule of Rates & KTPP Act 1999",
  HIDDEN: "MoRTH specs & PWD Code (hidden-layer measurement)",
  MB: "KPWD MB-book maintenance rules & test-check norms",
  DD: "KW-4 agreement: FSD / security-deposit clauses",
  IN: "KW-4 agreement: insurance & performance-security clauses",
  EL: "KTPP Act 1999 & contractor-registration (KW) rules",
  CH: "KW-4 agreement timeline clauses & PWD Code file-movement norms",
  ROY: "Karnataka Minor Mineral Concession Rules (royalty / mineral dispatch)",
  SAL: "KPWD salvage / dismantled-material register rules",
  DISP: "C&D Waste Management Rules 2016 & dumping-yard norms",
  PHOTO: "Geo-tag / portal-log evidence (IT Act 2000 s.65B for electronic records)",
};

/** Finding-code prefix → illustrative court principle (cautious; for Lokayukta variant). */
export const RULING_MAP: Record<string, string> = {
  EXCESS: "Principles on quantity variation & unauthorised excess in public-works payment",
  RATE: "Principles on payment beyond sanctioned rates",
  MB: "Principles on the evidentiary value of measurement-book entries",
  EL: "Principles on tender eligibility & substantial compliance",
  PHOTO: "Section 65B Indian Evidence Act — admissibility of electronic records",
  CH: "Principles on the sanctity of departmental file noting & sanction sequence",
};

/** RTI variant: each finding-code prefix → the exact record the RTI should seek. */
export const RTI_RECORD_SWITCH: Record<string, string> = {
  ARITH: "certified copies of all part bills and the final bill with the abstract of cost",
  EXCESS: "the technical sanction, work order, agreement and modified Schedule-B with sanction order for excess quantities",
  QT: "the original and revised Schedule-B with the competent-authority approval for quantity variation",
  RATE: "the rate analysis and the Schedule-of-Rates page applied for each non-SR item",
  MB: "certified copies of the relevant MB-book pages with the test-check entries and the recording officer's signature",
  DD: "the FSD / security-deposit recovery entries and the agreement security clause",
  IN: "the CAR / WC / third-party insurance policies and the performance-security instrument with validity",
  EL: "the contractor's registration certificate, similar-work experience, turnover and bid-capacity documents filed with the bid",
  CH: "the file-movement register and the dated approvals for TS, work order and agreement",
  ROY: "the royalty / mineral-dispatch challans and the consumption reconciliation statement",
  PHOTO: "the original geo-tagged before / during / after photographs with portal upload logs and metadata",
};

/** Cautious sentence templates the AI may use (defensive defaults). */
export const CAUTIOUS_SENTENCE_BANK = {
  introduction:
    "ಈ ಕೆಳಗಿನ ಅಂಶಗಳು ಸರಬರಾಜು ಮಾಡಿದ ದಾಖಲೆಗಳ ಆಧಾರದ ಮೇಲೆ ಕಂಡುಬಂದ ಸಂದೇಹಗಳಾಗಿದ್ದು, ಮೂಲ ದಾಖಲೆಗಳ ಹಾಜರಾತಿ ಮತ್ತು ಸ್ಪಷ್ಟೀಕರಣವನ್ನು ಕೋರಲಾಗಿದೆ.",
  caveat:
    "ಮೇಲಿನ ಎಲ್ಲಾ ಅಂಶಗಳು ಸರಬರಾಜು ಮಾಡಿದ ದಾಖಲೆಗಳ ಆಧಾರದ ಮೇಲೆ ಕಂಡುಬಂದ ಸಂದೇಹಗಳಾಗಿವೆ; ಇವು ಯಾವುದೇ ವ್ಯಕ್ತಿಯ ಮೇಲಿನ ಅಂತಿಮ ತೀರ್ಪು ಅಲ್ಲ. ಮೂಲ ದಾಖಲೆಗಳ ಪರಿಶೀಲನೆಯ ನಂತರವೇ ಅಂತಿಮ ನಿರ್ಧಾರ ಸಾಧ್ಯ.",
  escalation:
    "ಸೂಚಿಸಿದ ಅವಧಿಯೊಳಗೆ ತೃಪ್ತಿಕರ ಸ್ಪಷ್ಟೀಕರಣ ಮತ್ತು ದಾಖಲೆಗಳು ದೊರೆಯದಿದ್ದಲ್ಲಿ, ಲೋಕಾಯುಕ್ತ, ಮುಖ್ಯ ಎಂಜಿನಿಯರ್ ಮತ್ತು ಸಂಬಂಧಿತ ವಿಚಕ್ಷಣಾ ಪ್ರಾಧಿಕಾರಕ್ಕೆ ದೂರು ಸಲ್ಲಿಸಲಾಗುವುದು.",
} as const;
