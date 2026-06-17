/**
 * BBMP / GBA road-work forensic audit — the full 180-question / 17-section bank.
 *
 * Source: BBMP_Road_Audit_180_Questions.pdf (citizens' forensic audit spec).
 * Kannada text is transcribed verbatim from the PDF; English is a faithful
 * translation. Every question is a "suspicion (ಶಂಕೆ)", NOT an accusation — if the
 * proper record is produced, the suspicion is resolved.
 *
 * Severity flag per the PDF legend:
 *   RED    (ಗಂಭೀರ)  — serious; bill-stop-grade financial loss / fraud indicator
 *   ORANGE (ಹೆಚ್ಚು)  — high; serious quality / compliance / record gap
 *   AMBER  (ಮಧ್ಯಮ)  — medium; procedural / documentation confirmation
 *
 * FRAMEWORK-FREE: only type-imports from ./road-work-knowledge (erased at build),
 * so this stays pure and MCP-safe. road-work-knowledge.ts imports the VALUE
 * `ROAD_WORK_180` from here; the type-only direction back avoids a runtime cycle.
 */
import type { RoadWorkSection } from "./road-work-knowledge";

/** The full 17-section / 180-question forensic bank (S1..S17, Q1..Q180). */
export const ROAD_WORK_180: RoadWorkSection[] = [
  {
    id: "S1",
    titleEn: "Arithmetic checks",
    titleKn: "ಅಂಕಗಣಿತ ತಪಾಸಣೆ",
    range: "Q1-12",
    legalBasis:
      "KW-4 agreement + Karnataka Financial Code + PWD account manual — payment must rest on correct arithmetic; any excess paid through a calculation error is irregular expenditure recoverable from the certifying officer.",
    questions: [
      { code: "Q1", severity: "RED", en: "For every item, does (quantity × rate) = amount — is the calculation correct?", kn: "ಪ್ರತಿ ಐಟಂನ (ಪ್ರಮಾಣ × ದರ) = ಮೊತ್ತ — ಲೆಕ್ಕ ಸರಿಯಾಗಿದೆಯೇ?" },
      { code: "Q2", severity: "RED", en: "Does the total of all item amounts match the Gross Amount of the bill?", kn: "ಎಲ್ಲ ಐಟಂಗಳ ಮೊತ್ತದ ಒಟ್ಟು ಕೂಡಿಕೆ ಬಿಲ್‌ನ Gross Amount ಜೊತೆ ಹೊಂದುತ್ತದೆಯೇ?" },
      { code: "Q3", severity: "ORANGE", en: "Does Cheque Amount + By Adjustment = Gross Amount (is the bill CLOSED)?", kn: "Cheque Amount + By Adjustment = Gross Amount ಆಗುತ್ತದೆಯೇ (ಬಿಲ್ CLOSE ಆಗಿದೆಯೇ)?" },
      { code: "Q4", severity: "ORANGE", en: "Do all deductions (IT, CGST, SGST, LWF, CBF) sum to the Total Deductions shown?", kn: "ಎಲ್ಲ ಕಡಿತಗಳ (IT, CGST, SGST, LWF, CBF) ಒಟ್ಟು = Total Deductions ಆಗಿದೆಯೇ?" },
      { code: "Q5", severity: "ORANGE", en: "Is GST computed at the correct, currently-applicable rate?", kn: "GST ಮೊತ್ತ ಸರಿಯಾದ ದರದಲ್ಲಿ (ಪ್ರಸ್ತುತ ಅನ್ವಯ ದರ) ಲೆಕ್ಕ ಹಾಕಲಾಗಿದೆಯೇ?" },
      { code: "Q6", severity: "RED", en: "Do item rates match the tender / Schedule-B rates exactly — is there any rate inflation?", kn: "ಐಟಂ ದರಗಳು ಟೆಂಡರ್/Sch-B ದರಕ್ಕೆ ನಿಖರವಾಗಿ ಹೊಂದುತ್ತವೆಯೇ — ಯಾವುದೇ ದರ ಏರಿಕೆ ಇದೆಯೇ?" },
      { code: "Q7", severity: "AMBER", en: "Has any excess amount crept in through a rounding-off error?", kn: "ರೌಂಡಿಂಗ್ (round-off) ತಪ್ಪಿನಿಂದ ಹೆಚ್ಚುವರಿ ಮೊತ್ತ ಸೇರಿದೆಯೇ?" },
      { code: "Q8", severity: "RED", en: "Has the same item been billed twice (a duplicate line)?", kn: "ಒಂದೇ ಐಟಂ ಎರಡು ಬಾರಿ ಬಿಲ್‌ನಲ್ಲಿ ಬಂದಿದೆಯೇ (duplicate line)?" },
      { code: "Q9", severity: "ORANGE", en: "What is the variance between the tender amount and the final payment, and is it justified?", kn: "ಟೆಂಡರ್ ಮೊತ್ತ vs ಅಂತಿಮ ಪಾವತಿ ವ್ಯತ್ಯಾಸ ಎಷ್ಟು ಮತ್ತು ಅದಕ್ಕೆ ಸಮರ್ಥನೆ ಇದೆಯೇ?" },
      { code: "Q10", severity: "ORANGE", en: "Has the above/below-tender percentage (the quoted rate) been applied correctly?", kn: "Above/Below tender percentage (ಗುತ್ತಿಗೆ ದರ) ಸರಿಯಾಗಿ ಅನ್ವಯವಾಗಿದೆಯೇ?" },
      { code: "Q11", severity: "ORANGE", en: "Does the total of the part bills exceed the final bill?", kn: "ಭಾಗಶಃ ಬಿಲ್‌ಗಳ (part bills) ಒಟ್ಟು ಅಂತಿಮ ಬಿಲ್ ಮೀರಿದೆಯೇ?" },
      { code: "Q12", severity: "AMBER", en: "Is there any arithmetic correction / over-write in the bill without an authorising signature?", kn: "ಬಿಲ್‌ನಲ್ಲಿ ಯಾವುದೇ ಅಂಕಗಣಿತ ತಿದ್ದುಪಡಿ/ಓವರ್‌ರೈಟ್ ಸಹಿ ಇಲ್ಲದೆ ಇದೆಯೇ?" },
    ],
  },
  {
    id: "S2",
    titleEn: "Quantity escalation & the 125% limit",
    titleKn: "ಪ್ರಮಾಣ ಏರಿಕೆ ಮತ್ತು 125% ಮಿತಿ",
    range: "Q13-26",
    legalBasis:
      "KW-4 quantity-variation clause + KTPP Act 1999 + dated-sanction conditions — quantity beyond 125% needs a Modified Schedule-B / revised sanction before the work; excess priced without it is irregular.",
    questions: [
      { code: "Q13", severity: "ORANGE", en: "For each item, what is the % variance between the original Schedule-B quantity and the billed quantity?", kn: "ಪ್ರತಿ ಐಟಂನ ಮೂಲ Sch-B ಪ್ರಮಾಣ vs ಬಿಲ್ ಪ್ರಮಾಣ ವ್ಯತ್ಯಾಸ ಎಷ್ಟು %?" },
      { code: "Q14", severity: "RED", en: "Is any item exactly 125.0% (a suspicion of deliberate calibration)?", kn: "ಯಾವುದೇ ಐಟಂ ನಿಖರ 125.0% ಆಗಿದೆಯೇ (ಉದ್ದೇಶಪೂರ್ವಕ ಕ್ಯಾಲಿಬ್ರೇಶನ್ ಶಂಕೆ)?" },
      { code: "Q15", severity: "RED", en: "If several items are all at 125% together — is that random or a pattern?", kn: "ಬಹು ಐಟಂಗಳು ಒಟ್ಟಿಗೆ 125% ಆಗಿದ್ದರೆ — ಇದು ಯಾದೃಚ್ಛಿಕವೇ ಅಥವಾ ಮಾದರಿಯೇ?" },
      { code: "Q16", severity: "RED", en: "For quantity beyond 125%, is there a Modified Schedule-B approval?", kn: "125% ಮೀರಿದ ಪ್ರಮಾಣಕ್ಕೆ ದುರಸ್ತಿ Sch-B (Modified Schedule-B) ಅನುಮೋದನೆ ಇದೆಯೇ?" },
      { code: "Q17", severity: "ORANGE", en: "Is the Modified Schedule-B approval dated before the work was completed?", kn: "ದುರಸ್ತಿ Sch-B ಅನುಮೋದನೆ ದಿನಾಂಕ ಕಾಮಗಾರಿ ಮುಗಿಯುವ ಮುನ್ನವೇ ಇದೆಯೇ?" },
      { code: "Q18", severity: "RED", en: "What is the quantity-escalation amount (excess quantity × rate) — the total loss?", kn: "ಪ್ರಮಾಣ ಏರಿಕೆಯ ಮೊತ್ತ (ಹೆಚ್ಚುವರಿ ಪ್ರಮಾಣ × ದರ) ಎಷ್ಟು — ಒಟ್ಟು ನಷ್ಟ ಲೆಕ್ಕ?" },
      { code: "Q19", severity: "RED", en: "Did only the costly items (BC, DGBM) increase while the cheap items dropped?", kn: "ದುಬಾರಿ ಐಟಂಗಳ (BC, DGBM) ಪ್ರಮಾಣ ಮಾತ್ರ ಏರಿ, ಅಗ್ಗದ ಐಟಂ ಇಳಿದಿದೆಯೇ?" },
      { code: "Q20", severity: "ORANGE", en: "Were the reduced items (DLC, PCC) properly deducted from the bill?", kn: "ಕಡಿಮೆ ಆದ ಐಟಂಗಳ (DLC, PCC) ಮೊತ್ತ ಬಿಲ್‌ನಿಂದ ಸರಿಯಾಗಿ ಕಡಿತವಾಗಿದೆಯೇ?" },
      { code: "Q21", severity: "ORANGE", en: "Is the quantity increase based on real field measurement, or just original × 1.25?", kn: "ಪ್ರಮಾಣ ಏರಿಕೆ ನಿಜವಾದ ಕ್ಷೇತ್ರ ಅಳತೆ ಆಧಾರವೇ ಅಥವಾ ಮೂಲ × 1.25 ಸೂತ್ರವೇ?" },
      { code: "Q22", severity: "ORANGE", en: "If a new (non-tender / extra) item was added, is there a rate analysis?", kn: "ಹೊಸ ಐಟಂ (Non-tender/Extra item) ಸೇರಿಸಿದ್ದರೆ ದರ ವಿಶ್ಲೇಷಣೆ (rate analysis) ಇದೆಯೇ?" },
      { code: "Q23", severity: "ORANGE", en: "Does the new item carry competent-authority approval?", kn: "ಹೊಸ ಐಟಂಗೆ ಸಕ್ಷಮ ಪ್ರಾಧಿಕಾರದ ಅನುಮೋದನೆ ಇದೆಯೇ?" },
      { code: "Q24", severity: "RED", en: "Does the total bill amount exceed the administrative-sanction amount?", kn: "ಒಟ್ಟು ಬಿಲ್ ಮೊತ್ತ ಆಡಳಿತ ಮಂಜೂರಾತಿ ಮೊತ್ತ ಮೀರಿದೆಯೇ?" },
      { code: "Q25", severity: "ORANGE", en: "If exceeded, is there a Revised Administrative / Technical Sanction (Revised AS/TS)?", kn: "ಮೀರಿದ್ದರೆ ಪರಿಷ್ಕೃತ ಆಡಳಿತ/ತಾಂತ್ರಿಕ ಮಂಜೂರಾತಿ (Revised AS/TS) ಇದೆಯೇ?" },
      { code: "Q26", severity: "ORANGE", en: "Is the quantity increase supported by the MB and photo evidence?", kn: "ಪ್ರಮಾಣ ಏರಿಕೆಯನ್ನು MB ಮತ್ತು ಫೋಟೋ ಸಾಕ್ಷ್ಯ ಬೆಂಬಲಿಸುತ್ತದೆಯೇ?" },
    ],
  },
  {
    id: "S3",
    titleEn: "Layer thickness & area calculation",
    titleKn: "ಪದರ ದಪ್ಪ ಮತ್ತು ಪ್ರದೇಶ ಲೆಕ್ಕ",
    range: "Q27-38",
    legalBasis:
      "MoRTH Specifications + IRC:37 / IRC:81 / IRC:SP-55 + KW-4 MB integrity — billed area/thickness must be geometrically and technically possible and match the measurement book.",
    questions: [
      { code: "Q27", severity: "ORANGE", en: "For each layer, is Volume ÷ Thickness = Area computed correctly?", kn: "ಪ್ರತಿ ಪದರಕ್ಕೆ Volume ÷ Thickness = Area ಲೆಕ್ಕ ಸರಿಯಾಗಿದೆಯೇ?" },
      { code: "Q28", severity: "ORANGE", en: "Is the BC-area ÷ DGBM-area ratio technically reasonable (normally ~1:1)?", kn: "BC ಪ್ರದೇಶ ÷ DGBM ಪ್ರದೇಶ ಅನುಪಾತ ತಾಂತ್ರಿಕವಾಗಿ ಸಮಂಜಸವೇ (ಸಾಮಾನ್ಯ ~1:1)?" },
      { code: "Q29", severity: "ORANGE", en: "Is there a large difference between the BC and base-layer (WMM/DGBM) areas?", kn: "BC ಮತ್ತು ತಳ ಪದರ (WMM/DGBM) ಪ್ರದೇಶದಲ್ಲಿ ದೊಡ್ಡ ವ್ಯತ್ಯಾಸ ಇದೆಯೇ?" },
      { code: "Q30", severity: "RED", en: "Was BC done as a full overlay while the base layer was only patchwork?", kn: "BC ಪೂರ್ಣ ರಸ್ತೆ ಓವರ್‌ಲೇ ಆಗಿ, ತಳ ಪದರ ಕೇವಲ ಪ್ಯಾಚ್ ವರ್ಕ್ ಆಗಿದೆಯೇ?" },
      { code: "Q31", severity: "ORANGE", en: "If so, is a BC overlay without a new base structure technically justifiable?", kn: "ಹಾಗಿದ್ದರೆ — ತಳ ಹೊಸ ರಚನೆ ಇಲ್ಲದೆ BC ಓವರ್‌ಲೇ ತಾಂತ್ರಿಕವಾಗಿ ಸಮರ್ಥನೀಯವೇ?" },
      { code: "Q32", severity: "ORANGE", en: "Is the layer thickness as per the TS / standard?", kn: "ಪದರ ದಪ್ಪ (thickness) TS/ಮಾನದಂಡ ಪ್ರಕಾರ ಸರಿಯಾಗಿದೆಯೇ?" },
      { code: "Q33", severity: "RED", en: "Does the billed thickness match the actual road thickness (core cutting)?", kn: "ಬಿಲ್ ಮಾಡಿದ ದಪ್ಪ vs ನಿಜ ರಸ್ತೆ ದಪ್ಪ (Core cutting) ಹೊಂದುತ್ತದೆಯೇ?" },
      { code: "Q34", severity: "ORANGE", en: "Road length × average width = billed area — is this geographically possible?", kn: "ರಸ್ತೆ ಉದ್ದ × ಸರಾಸರಿ ಅಗಲ = ಬಿಲ್ ಪ್ರದೇಶ — ಭೌಗೋಳಿಕವಾಗಿ ಸಾಧ್ಯವೇ?" },
      { code: "Q35", severity: "RED", en: "Does the total BC area (per km) exceed the road's real length?", kn: "ಒಟ್ಟು BC ಪ್ರದೇಶ (km) ರಸ್ತೆಯ ನಿಜ ಉದ್ದ ಮೀರಿದೆಯೇ?" },
      { code: "Q36", severity: "AMBER", en: "Does the Tack Coat / Prime Coat area match the BC / base area?", kn: "Tack Coat / Prime Coat ಪ್ರದೇಶ BC/ತಳ ಪ್ರದೇಶಕ್ಕೆ ಹೊಂದುತ್ತದೆಯೇ?" },
      { code: "Q37", severity: "AMBER", en: "Are the L-Section and Cross-Section records present?", kn: "L-Section ಮತ್ತು Cross-Section ದಾಖಲೆ ಇದೆಯೇ?" },
      { code: "Q38", severity: "ORANGE", en: "Is the chainage in the MB continuous, or scattered patch-by-patch?", kn: "MB ನಲ್ಲಿ ಚೈನೇಜ್ (chainage) ನಿರಂತರವೇ ಅಥವಾ ತುಂಡು ತುಂಡು ಪ್ಯಾಚ್‌ಗಳೇ?" },
    ],
  },
  {
    id: "S4",
    titleEn: "Ward & location match",
    titleKn: "ವಾರ್ಡ್ ಮತ್ತು ಸ್ಥಳ ಹೊಂದಾಣಿಕೆ",
    range: "Q39-46",
    legalBasis:
      "Administrative-sanction conditions + GBA 369-ward structure + KTPP Act 1999 — work must be executed at the sanctioned ward/location; billing another location under this job code is irregular.",
    questions: [
      { code: "Q39", severity: "ORANGE", en: "Does the ward on the Job Number Certificate match the ward in the MB note?", kn: "Job Number Certificate ನ ವಾರ್ಡ್ vs MB ನೋಟ್‌ನ ವಾರ್ಡ್ ಹೊಂದುತ್ತದೆಯೇ?" },
      { code: "Q40", severity: "ORANGE", en: "Does the first number of the job code (ward) match the sanctioned ward?", kn: "ಜಾಬ್ ಕೋಡ್‌ನ ಮೊದಲ ಸಂಖ್ಯೆ (ವಾರ್ಡ್) ಮಂಜೂರಾತಿ ವಾರ್ಡ್‌ಗೆ ಸರಿಹೊಂದುತ್ತದೆಯೇ?" },
      { code: "Q41", severity: "RED", en: "Is the sanctioned location the same as the actual work location?", kn: "ಮಂಜೂರಾದ ಸ್ಥಳ vs ನಿಜ ಕಾಮಗಾರಿ ಸ್ಥಳ ಒಂದೇ ಆಗಿದೆಯೇ?" },
      { code: "Q42", severity: "AMBER", en: "Is the road name / maps number recorded in the sanction letter?", kn: "ರಸ್ತೆ ಹೆಸರು/ಮ್ಯಾಪ್ಸ್ ಸಂಖ್ಯೆ ಮಂಜೂರಾತಿ ಪತ್ರದಲ್ಲಿ ಇದೆಯೇ?" },
      { code: "Q43", severity: "RED", en: "Has work belonging to another ward been billed under this job code?", kn: "ಬೇರೆ ವಾರ್ಡ್‌ನ ಕಾಮಗಾರಿಯನ್ನು ಈ ಜಾಬ್ ಕೋಡ್‌ನಡಿ ಬಿಲ್ ಮಾಡಲಾಗಿದೆಯೇ?" },
      { code: "Q44", severity: "AMBER", en: "Is the ward allocation of Mayor / MLA grant (Mayor Works) correct?", kn: "ಮೇಯರ್/ಶಾಸಕ ಅನುದಾನ (Mayor Works) ವಾರ್ಡ್ ಹಂಚಿಕೆ ಸರಿಯಾಗಿದೆಯೇ?" },
      { code: "Q45", severity: "AMBER", en: "After the GBA restructure (369 wards), is the ward mapping correct?", kn: "GBA ಮರುಸಂಘಟನೆ (369 ವಾರ್ಡ್) ನಂತರ ವಾರ್ಡ್ ಮ್ಯಾಪಿಂಗ್ ಸರಿ ಇದೆಯೇ?" },
      { code: "Q46", severity: "RED", en: "Has the same road been billed under two wards' two job codes?", kn: "ಒಂದೇ ರಸ್ತೆ ಎರಡು ವಾರ್ಡ್‌ನ ಎರಡು ಜಾಬ್ ಕೋಡ್‌ನಲ್ಲಿ ಬಂದಿದೆಯೇ?" },
    ],
  },
  {
    id: "S5",
    titleEn: "Quality-test records",
    titleKn: "ಗುಣಮಟ್ಟ ಪರೀಕ್ಷೆ ದಾಖಲೆ",
    range: "Q47-60",
    legalBasis:
      "TS conditions + QAP + MoRTH Section 500 + IRC:SP-57 + KW-4 quality clauses — core-cutting, Marshall, density and material tests are mandatory; a bill without quality records is a suspect amount.",
    questions: [
      { code: "Q47", severity: "AMBER", en: "Is the Quality Assurance Plan (QAP) approved as required by the TS condition?", kn: "TS ಷರತ್ತಿನ ಪ್ರಕಾರ Quality Assurance Plan (QAP) ಅನುಮೋದನೆ ಇದೆಯೇ?" },
      { code: "Q48", severity: "ORANGE", en: "Is there a core-cutting report for the BC layer (minimum one sample per 500m)?", kn: "BC ಪದರಕ್ಕೆ Core cutting ವರದಿ ಇದೆಯೇ (ಪ್ರತಿ 500m ಗೆ ಕನಿಷ್ಠ ಮಾದರಿ)?" },
      { code: "Q49", severity: "ORANGE", en: "Is there a Marshall Stability test report?", kn: "Marshall Stability test ವರದಿ ಇದೆಯೇ?" },
      { code: "Q50", severity: "ORANGE", en: "Is there a Bitumen Content / Extraction test report (ASTM D2172)?", kn: "Bitumen Content / Extraction test (ASTM D2172) ವರದಿ ಇದೆಯೇ?" },
      { code: "Q51", severity: "ORANGE", en: "Is there a Field Density / Compaction test report?", kn: "Field Density / Compaction test ವರದಿ ಇದೆಯೇ?" },
      { code: "Q52", severity: "AMBER", en: "Are the Batch Mix Plant challan and temperature records present?", kn: "Batch Mix Plant challan ಮತ್ತು ತಾಪಮಾನ (temperature) ದಾಖಲೆ ಇದೆಯೇ?" },
      { code: "Q53", severity: "ORANGE", en: "Are there gradation and CBR test reports for the WMM/DGBM layer?", kn: "WMM/DGBM ಪದರಕ್ಕೆ gradation ಮತ್ತು CBR test ಇದೆಯೇ?" },
      { code: "Q54", severity: "AMBER", en: "Are the cement / steel / aggregate material-test reports present?", kn: "ಸಿಮೆಂಟ್/ಸ್ಟೀಲ್/ಜಲ್ಲಿ ಸಾಮಗ್ರಿ ಪರೀಕ್ಷೆ (material test) ವರದಿ ಇದೆಯೇ?" },
      { code: "Q55", severity: "AMBER", en: "Is the PMC (Project Management Consultant) quality certificate present?", kn: "PMC (Project Management Consultant) ಗುಣಮಟ್ಟ ಪ್ರಮಾಣ ಪತ್ರ ಇದೆಯೇ?" },
      { code: "Q56", severity: "ORANGE", en: "Was a third-party quality inspection carried out?", kn: "ಮೂರನೇ ಪಕ್ಷದ (third-party) ಗುಣಮಟ್ಟ ತಪಾಸಣೆ ನಡೆದಿದೆಯೇ?" },
      { code: "Q57", severity: "AMBER", en: "Are the quality-test dates within the work period?", kn: "ಗುಣಮಟ್ಟ ಪರೀಕ್ಷೆ ದಿನಾಂಕ ಕಾಮಗಾರಿ ಅವಧಿಯೊಳಗೆ ಇದೆಯೇ?" },
      { code: "Q58", severity: "RED", en: "Are the test results within standard limits, or did they fail?", kn: "ಪರೀಕ್ಷಾ ಫಲಿತಾಂಶ ಮಾನದಂಡ ಮಿತಿಯೊಳಗೆ ಇದೆಯೇ ಅಥವಾ ವಿಫಲವೇ?" },
      { code: "Q59", severity: "ORANGE", en: "What bill amount has no quality records behind it (the suspect amount)?", kn: "ಗುಣಮಟ್ಟ ದಾಖಲೆ ಇಲ್ಲದ ಬಿಲ್ ಮೊತ್ತ ಎಷ್ಟು (ಪ್ರವಾಹ ಮೊತ್ತ)?" },
      { code: "Q60", severity: "ORANGE", en: "Did the road deteriorate within the Defect Liability Period — is repair on the contractor?", kn: "ರಸ್ತೆ DLP (Defect Liability Period) ಒಳಗೆ ಹಾಳಾಗಿದೆಯೇ — ದುರಸ್ತಿ ಗುತ್ತಿಗೆದಾರನ ಮೇಲೆ ಇದೆಯೇ?" },
    ],
  },
  {
    id: "S6",
    titleEn: "Time delay & liquidated damages (LD)",
    titleKn: "ಕಾಲ ವಿಳಂಬ ಮತ್ತು ದಂಡ (LD)",
    range: "Q61-70",
    legalBasis:
      "KW-4 LD clause + KTPP Act 1999 Sec.16 — LD at 0.5%/week (max 10%) is mandatory for delay; not deducting it without a competent waiver is a recoverable public loss.",
    questions: [
      { code: "Q61", severity: "AMBER", en: "What is the work start date per the work order?", kn: "ವರ್ಕ್ ಆರ್ಡರ್ ಪ್ರಕಾರ ಕಾಮಗಾರಿ ಆರಂಭ ದಿನಾಂಕ ಯಾವುದು?" },
      { code: "Q62", severity: "AMBER", en: "What is the completion date per the contract?", kn: "ಒಪ್ಪಂದ ಪ್ರಕಾರ ಗಡುವು (completion date) ಯಾವುದು?" },
      { code: "Q63", severity: "AMBER", en: "What is the actual completion date (PWG-47)?", kn: "ನಿಜ ಮುಗಿತಾಯ ದಿನಾಂಕ (PWG-47) ಯಾವುದು?" },
      { code: "Q64", severity: "ORANGE", en: "What is the total delay in days / weeks?", kn: "ಒಟ್ಟು ವಿಳಂಬ ಎಷ್ಟು ದಿನ/ವಾರ?" },
      { code: "Q65", severity: "ORANGE", en: "By the LD formula (0.5%/week, max 10%), what amount should have been levied?", kn: "LD ಲೆಕ್ಕ (0.5%/ವಾರ, ಗರಿಷ್ಠ 10%) — ಎಷ್ಟು ಮೊತ್ತ ಆಗಬೇಕಿತ್ತು?" },
      { code: "Q66", severity: "RED", en: "Was LD deducted in the bill, or not?", kn: "ಬಿಲ್‌ನಲ್ಲಿ LD ಕಡಿತ ಮಾಡಲಾಗಿದೆಯೇ ಅಥವಾ ಇಲ್ಲವೇ?" },
      { code: "Q67", severity: "ORANGE", en: "If LD was not deducted, is there a waiver order?", kn: "LD ಕಡಿತ ಮಾಡದಿದ್ದರೆ ವಿನಾಯಿತಿ (waiver) ಆದೇಶ ಇದೆಯೇ?" },
      { code: "Q68", severity: "ORANGE", en: "Does the waiver order carry a competent-authority signature?", kn: "ವಿನಾಯಿತಿ ಆದೇಶಕ್ಕೆ ಸಕ್ಷಮ ಪ್ರಾಧಿಕಾರದ ಸಹಿ ಇದೆಯೇ?" },
      { code: "Q69", severity: "AMBER", en: "Is there a contractor's written reason for delay and an Extension of Time (EOT)?", kn: "ವಿಳಂಬಕ್ಕೆ ಗುತ್ತಿಗೆದಾರನ ಲಿಖಿತ ಕಾರಣ ಮತ್ತು ಅವಧಿ ವಿಸ್ತರಣೆ (EOT) ಇದೆಯೇ?" },
      { code: "Q70", severity: "RED", en: "What public loss arose from not deducting LD?", kn: "LD ಕಡಿತ ಮಾಡದೆ ಸಂಭವಿಸಿದ ಸಾರ್ವಜನಿಕ ನಷ್ಟ ಎಷ್ಟು?" },
    ],
  },
  {
    id: "S7",
    titleEn: "Document completeness & contract",
    titleKn: "ದಾಖಲೆ ಪರಿಪೂರ್ಣತೆ ಮತ್ತು ಒಪ್ಪಂದ",
    range: "Q71-80",
    legalBasis:
      "Karnataka Financial Code + PWD account manual + KTPP registration norms — the executed agreement, security, PWG forms and a tamper-free signed MB are pre-conditions to a valid payment.",
    questions: [
      { code: "Q71", severity: "AMBER", en: "On the PWG-47 completion certificate, are the agreement number and date filled in?", kn: "PWG-47 ಪರಿಪೂರ್ಣಗೊಳಿಸುವಿಕೆ ಪ್ರಮಾಣ ಪತ್ರದಲ್ಲಿ ಒಪ್ಪಂದ ಸಂ. ಮತ್ತು ದಿನಾಂಕ ತುಂಬಿದೆಯೇ?" },
      { code: "Q72", severity: "ORANGE", en: "Is there an executed agreement on stamp paper?", kn: "ಸ್ಟಾಂಪ್ ಪೇಪರ್ ಸಹಿತ ಕಾರ್ಯಗತ ಒಪ್ಪಂದ (executed agreement) ಇದೆಯೇ?" },
      { code: "Q73", severity: "AMBER", en: "Is there an EMD (earnest money deposit) record?", kn: "EMD (ಮುಂಗಡ ಠೇವಣಿ) ದಾಖಲೆ ಇದೆಯೇ?" },
      { code: "Q74", severity: "ORANGE", en: "Is a Performance Security / Bank Guarantee present and valid?", kn: "Performance Security / Bank Guarantee ಇದೆಯೇ ಮತ್ತು ಮಾನ್ಯವೇ?" },
      { code: "Q75", severity: "AMBER", en: "Are the PWG-45 / 45A / 46 forms fully filled and signed?", kn: "PWG-45/45A/46 ನಮೂನೆಗಳ ಪರಿಪೂರ್ಣ ಭರ್ತಿ ಮತ್ತು ಸಹಿ ಆಗಿವೆಯೇ?" },
      { code: "Q76", severity: "ORANGE", en: "Are the MB book page numbers continuous and certified?", kn: "MB ಪುಸ್ತಕದ ಪುಟ ಸಂಖ್ಯೆ ನಿರಂತರ ಮತ್ತು ಪ್ರಮಾಣೀಕೃತವೇ?" },
      { code: "Q77", severity: "ORANGE", en: "Are all required signatures (AE / AEE / EE) on the record?", kn: "ಎಲ್ಲ ಅಗತ್ಯ ಸಹಿ (AE/AEE/EE) ದಾಖಲೆಯಲ್ಲಿ ಇವೆಯೇ?" },
      { code: "Q78", severity: "RED", en: "Is there a suspicion any form was blank-signed and filled in later?", kn: "ಯಾವುದೇ ನಮೂನೆ ಖಾಲಿ ಸಹಿ (blank signed) ಆಗಿ ನಂತರ ತುಂಬಿದ ಶಂಕೆ ಇದೆಯೇ?" },
      { code: "Q79", severity: "ORANGE", en: "Is the date sequence (work order → agreement → bill) logically correct?", kn: "ದಿನಾಂಕಗಳ ಅನುಕ್ರಮ (work order → agreement → bill) ತಾರ್ಕಿಕವಾಗಿ ಸರಿ ಇದೆಯೇ?" },
      { code: "Q80", severity: "RED", en: "Is there a signature-mismatch suspicion?", kn: "ಸಹಿ ಹೊಂದಾಣಿಕೆ (signature mismatch) ಶಂಕೆ ಇದೆಯೇ?" },
    ],
  },
  {
    id: "S8",
    titleEn: "Salvage accounting & soil disposal",
    titleKn: "ಸಾಲ್ವೇಜ್ ಲೆಕ್ಕ ಮತ್ತು ಮಣ್ಣು ವಿಲೇವಾರಿ",
    range: "Q81-90",
    legalBasis:
      "Karnataka Financial Code (store rules) + C&D Waste Management Rules 2016 + KSPCB norms — dismantled salvage is government property and must be store-registered, auctioned or deducted; soil carriage needs trip sheets and an authorised dumping yard.",
    questions: [
      { code: "Q81", severity: "AMBER", en: "What quantity (cu.m) of material (RCC, stone, steel) was dismantled?", kn: "ಡಿಸ್ಮ್ಯಾಂಟ್ ಆದ ಪ್ರಮಾಣ (RCC, ಕಲ್ಲು, ಕಬ್ಬಿಣ) ಎಷ್ಟು ಘನ.ಮೀ?" },
      { code: "Q82", severity: "AMBER", en: "Is there a stock-register entry for the dismantled materials?", kn: "ಡಿಸ್ಮ್ಯಾಂಟ್ ವಸ್ತುಗಳ ಸ್ಟಾಕ್ ರಿಜಿಸ್ಟರ್ ನಮೂದು ಇದೆಯೇ?" },
      { code: "Q83", severity: "ORANGE", en: "Was an auction of the salvage materials conducted?", kn: "ಸಾಲ್ವೇಜ್ ವಸ್ತುಗಳ ಹರಾಜು (auction) ನಡೆದಿದೆಯೇ?" },
      { code: "Q84", severity: "RED", en: "Were the auction proceeds deducted from the bill?", kn: "ಹರಾಜು ಹಣ ಬಿಲ್‌ನಿಂದ ಕಡಿತ ಮಾಡಲಾಗಿದೆಯೇ?" },
      { code: "Q85", severity: "ORANGE", en: "What was the excavation quantity, and where did the soil go?", kn: "ಭೂ ಅಗೆತ (excavation) ಪ್ರಮಾಣ ಎಷ್ಟು ಮತ್ತು ಮಣ್ಣು ಎಲ್ಲಿ ಹೋಯಿತು?" },
      { code: "Q86", severity: "ORANGE", en: "Is there a soil-carriage trip sheet (lorry trips) record?", kn: "ಮಣ್ಣು ಸಾಗಣೆ Trip Sheet (ಲಾರಿ ಟ್ರಿಪ್) ದಾಖಲೆ ಇದೆಯೇ?" },
      { code: "Q87", severity: "ORANGE", en: "Does the lorry-trip count match the quantity (10-wheeler × trips norm)?", kn: "ಲಾರಿ ಟ್ರಿಪ್ ಸಂಖ್ಯೆ ಪ್ರಮಾಣಕ್ಕೆ ಹೊಂದುತ್ತದೆಯೇ (10-ಚಕ್ರ × ಟ್ರಿಪ್ ರೂಢಿ)?" },
      { code: "Q88", severity: "AMBER", en: "Is there an authorised Dumping Yard receipt?", kn: "ಅಧಿಕೃತ Dumping Yard ರಸೀದಿ ಇದೆಯೇ?" },
      { code: "Q89", severity: "AMBER", en: "Is there KSPCB permission for C&D waste disposal?", kn: "C&D ತ್ಯಾಜ್ಯ ವಿಲೇವಾರಿಗೆ KSPCB ಅನುಮತಿ ಇದೆಯೇ?" },
      { code: "Q90", severity: "RED", en: "What is the total unrecovered salvage / soil amount?", kn: "ಸಾಲ್ವೇಜ್/ಮಣ್ಣು ವಸೂಲಿ ಆಗದ ಒಟ್ಟು ಮೊತ್ತ ಎಷ್ಟು?" },
    ],
  },
  {
    id: "S9",
    titleEn: "Tender process & contractor eligibility",
    titleKn: "ಟೆಂಡರ್ ಮತ್ತು ಗುತ್ತಿಗೆದಾರ ಅರ್ಹತೆ",
    range: "Q91-102",
    legalBasis:
      "KTPP Act 1999 Sec.4/16 + e-Procurement norms — transparent, competitive e-tender to an eligible, non-blacklisted L1 contractor; cartel/bid-rigging or subletting are violations.",
    questions: [
      { code: "Q91", severity: "AMBER", en: "Was the tender notice properly published?", kn: "ಟೆಂಡರ್ ಸೂಚನೆ (tender notice) ಸರಿಯಾದ ಪ್ರಚಾರ ಪಡೆದಿದೆಯೇ?" },
      { code: "Q92", severity: "ORANGE", en: "Was the tender conducted on the e-Procurement portal?", kn: "ಟೆಂಡರ್ ಪ್ರಕ್ರಿಯೆ e-Procurement ಪೋರ್ಟಲ್‌ನಲ್ಲಿ ನಡೆದಿದೆಯೇ?" },
      { code: "Q93", severity: "ORANGE", en: "Were there enough bidders (adequate competition)?", kn: "ಕನಿಷ್ಠ ಬಿಡ್‌ದಾರರ ಸಂಖ್ಯೆ (competition) ಸಾಕಷ್ಟು ಇತ್ತೇ?" },
      { code: "Q94", severity: "ORANGE", en: "Did the contractor meet the eligibility criteria (turnover, experience)?", kn: "ಗುತ್ತಿಗೆದಾರನ ಅರ್ಹತಾ ಮಾನದಂಡ (turnover, ಅನುಭವ) ಪೂರೈಸಿದೆಯೇ?" },
      { code: "Q95", severity: "RED", en: "Is the contractor absent from any blacklist?", kn: "ಗುತ್ತಿಗೆದಾರ ಬ್ಲಾಕ್ ಲಿಸ್ಟ್ ಪಟ್ಟಿಯಲ್ಲಿ ಇಲ್ಲವೇ?" },
      { code: "Q96", severity: "ORANGE", en: "Did one contractor receive a disproportionate number of works?", kn: "ಒಂದೇ ಗುತ್ತಿಗೆದಾರನಿಗೆ ಅಸಮಂಜಸ ಸಂಖ್ಯೆಯ ಕಾಮಗಾರಿ ಸಿಕ್ಕಿದೆಯೇ?" },
      { code: "Q97", severity: "RED", en: "Is there a suspicious alignment among the bids (cartel / bid-rigging)?", kn: "ಬಿಡ್ ದರಗಳ ನಡುವೆ ಶಂಕಾಸ್ಪದ ಹೊಂದಾಣಿಕೆ (cartel/bid rigging) ಇದೆಯೇ?" },
      { code: "Q98", severity: "ORANGE", en: "Did the L1 (lowest bid) contractor actually get the work?", kn: "L1 (ಕಡಿಮೆ ಬಿಡ್) ಗುತ್ತಿಗೆದಾರನಿಗೇ ಕಾಮಗಾರಿ ಸಿಕ್ಕಿದೆಯೇ?" },
      { code: "Q99", severity: "AMBER", en: "Are the contractor's GST / PAN / registration valid?", kn: "ಗುತ್ತಿಗೆದಾರನ GST/PAN/ನೋಂದಣಿ ಮಾನ್ಯವೇ?" },
      { code: "Q100", severity: "ORANGE", en: "Has the anti-subletting condition been violated?", kn: "ಉಪ-ಗುತ್ತಿಗೆ (subletting) ನಿಷೇಧ ಷರತ್ತು ಉಲ್ಲಂಘನೆಯಾಗಿದೆಯೇ?" },
      { code: "Q101", severity: "AMBER", en: "Are the tender documents and agreement terms consistent?", kn: "ಟೆಂಡರ್ ದಾಖಲೆ ಮತ್ತು ಒಪ್ಪಂದ ಷರತ್ತುಗಳು ಹೊಂದುತ್ತವೆಯೇ?" },
      { code: "Q102", severity: "AMBER", en: "Is there a quality record of the contractor's past works?", kn: "ಗುತ್ತಿಗೆದಾರನ ಹಿಂದಿನ ಕಾಮಗಾರಿಗಳ ಗುಣಮಟ್ಟ ದಾಖಲೆ ಇದೆಯೇ?" },
    ],
  },
  {
    id: "S10",
    titleEn: "Insurance & labour welfare",
    titleKn: "ವಿಮೆ ಮತ್ತು ಶ್ರಮಿಕ ಕಲ್ಯಾಣ",
    range: "Q103-112",
    legalBasis:
      "Contract conditions + labour-welfare laws + CAR policy norms — CAR + workmen's compensation insurance and LWF/CBF cess are mandatory; unpaid amounts must be deducted from the bill.",
    questions: [
      { code: "Q103", severity: "ORANGE", en: "Is there a Contractor All Risk (CAR) insurance policy?", kn: "Contractor All Risk (CAR) ವಿಮೆ ಪಾಲಿಸಿ ಇದೆಯೇ?" },
      { code: "Q104", severity: "AMBER", en: "Does the insurance period cover the work period + DLP?", kn: "ವಿಮೆ ಅವಧಿ ಕಾಮಗಾರಿ ಅವಧಿ + DLP ಒಳಗೊಂಡಿದೆಯೇ?" },
      { code: "Q105", severity: "AMBER", en: "Is the sum insured adequate against the contract value?", kn: "ವಿಮೆ ಮೊತ್ತ ಒಪ್ಪಂದ ಮೌಲ್ಯಕ್ಕೆ ಸಾಕಷ್ಟು ಇದೆಯೇ?" },
      { code: "Q106", severity: "ORANGE", en: "Is there Workmen's Compensation insurance?", kn: "ಶ್ರಮಿಕ ವಿಮೆ (Workmen Compensation) ಇದೆಯೇ?" },
      { code: "Q107", severity: "AMBER", en: "Was the Labour Welfare Fund (LWF) deducted at the correct rate?", kn: "Labour Welfare Fund (LWF) ಕಡಿತ ಸರಿಯಾದ ದರದಲ್ಲಿ ಆಗಿದೆಯೇ?" },
      { code: "Q108", severity: "AMBER", en: "Was the Cess Building Fund (CBF) deducted correctly?", kn: "Cess Building Fund (CBF) ಕಡಿತ ಸರಿಯಾಗಿದೆಯೇ?" },
      { code: "Q109", severity: "AMBER", en: "Are labour safety gear and a safety report present?", kn: "ಶ್ರಮಿಕ ಸುರಕ್ಷಾ ಸಲಕರಣೆ ಮತ್ತು ಸುರಕ್ಷಾ ವರದಿ ಇದೆಯೇ?" },
      { code: "Q110", severity: "AMBER", en: "Are worker-registration and wage records present?", kn: "ಶ್ರಮಿಕರ ನೋಂದಣಿ ಮತ್ತು ವೇತನ ದಾಖಲೆ ಇದೆಯೇ?" },
      { code: "Q111", severity: "ORANGE", en: "If insurance was not taken, is that a breach of the contract condition?", kn: "ವಿಮೆ ಕಟ್ಟದಿದ್ದರೆ — ಇದು ಒಪ್ಪಂದ ಷರತ್ತಿನ ಉಲ್ಲಂಘನೆಯೇ?" },
      { code: "Q112", severity: "ORANGE", en: "Was the unpaid insurance / cess amount deducted from the bill?", kn: "ಕಟ್ಟದ ವಿಮೆ/Cess ಮೊತ್ತವನ್ನು ಬಿಲ್‌ನಿಂದ ಕಡಿತ ಮಾಡಲಾಗಿದೆಯೇ?" },
    ],
  },
  {
    id: "S11",
    titleEn: "Photo & geo-tag verification",
    titleKn: "ಫೋಟೋ ಮತ್ತು ಜಿಯೋ-ಟ್ಯಾಗ್ ಪರಿಶೀಲನೆ",
    range: "Q113-124",
    legalBasis:
      "BBMP/GBA Commissioner orders + GPS Map-Camera norms + portal circular — auto-stamped Before/During/After geo-tagged photos at the sanctioned location are mandatory before bill certification; reused or morphed photos are a serious red flag.",
    questions: [
      { code: "Q113", severity: "ORANGE", en: "Were Before / During / After photos uploaded to the portal?", kn: "ಪೋರ್ಟಲ್‌ನಲ್ಲಿ Before/During/After ಫೋಟೋ ಅಪ್‌ಲೋಡ್ ಆಗಿದೆಯೇ?" },
      { code: "Q114", severity: "ORANGE", en: "Do the photos carry GPS coordinates (geo-tag)?", kn: "ಫೋಟೋಗಳಲ್ಲಿ GPS ನಿರ್ದೇಶಾಂಕ (geo-tag) ಇದೆಯೇ?" },
      { code: "Q115", severity: "ORANGE", en: "Do the GPS coordinates match the sanctioned work location?", kn: "GPS ನಿರ್ದೇಶಾಂಕ ಮಂಜೂರಾದ ಕಾಮಗಾರಿ ಸ್ಥಳಕ್ಕೆ ಹೊಂದುತ್ತದೆಯೇ?" },
      { code: "Q116", severity: "RED", en: "Has the same photo been used (duplicate) across two / many job codes?", kn: "ಒಂದೇ ಫೋಟೋ ಎರಡು/ಹಲವು ಜಾಬ್ ಕೋಡ್‌ಗೆ (duplicate) ಬಳಸಲಾಗಿದೆಯೇ?" },
      { code: "Q117", severity: "ORANGE", en: "Does the photo date / time match the work period?", kn: "ಫೋಟೋದ ದಿನಾಂಕ/ಸಮಯ ಕಾಮಗಾರಿ ಅವಧಿಗೆ ಹೊಂದುತ್ತದೆಯೇ?" },
      { code: "Q118", severity: "ORANGE", en: "Are the Before and After photos of the same place (angle / landmark match)?", kn: "Before ಮತ್ತು After ಫೋಟೋ ಒಂದೇ ಸ್ಥಳದೇ (angle/landmark ಹೊಂದಾಣಿಕೆ)?" },
      { code: "Q119", severity: "RED", en: "Is there a suspicion of photo edit / photoshop / timestamp tampering?", kn: "ಫೋಟೋ edit/photoshop/timestamp tampering ಶಂಕೆ ಇದೆಯೇ?" },
      { code: "Q120", severity: "AMBER", en: "Is the info board (job code, amount, contractor) visible in the photo?", kn: "ಮಾಹಿತಿ ಫಲಕ (info board — ಜಾಬ್ ಕೋಡ್, ಮೊತ್ತ, ಗುತ್ತಿಗೆದಾರ) ಫೋಟೋದಲ್ಲಿ ಇದೆಯೇ?" },
      { code: "Q121", severity: "RED", en: "Does the work shown in the photo match the billed quantity?", kn: "ಫೋಟೋದಲ್ಲಿ ತೋರಿಸಿದ ಕೆಲಸ ಬಿಲ್ ಮಾಡಿದ ಪ್ರಮಾಣಕ್ಕೆ ಹೊಂದುತ್ತದೆಯೇ?" },
      { code: "Q122", severity: "RED", en: "Have photos of another / older work been recycled?", kn: "ಬೇರೆ ಕಾಮಗಾರಿಯ/ಹಳೆಯ ಫೋಟೋ ಮರುಬಳಕೆ (recycled) ಆಗಿದೆಯೇ?" },
      { code: "Q123", severity: "AMBER", en: "Is the number of photos adequate per the norms?", kn: "ಫೋಟೋ ಸಂಖ್ಯೆ ಮಾನದಂಡ ಪ್ರಕಾರ ಸಾಕಷ್ಟು ಇದೆಯೇ?" },
      { code: "Q124", severity: "RED", en: "Do the site-visit findings contradict the photo evidence?", kn: "ಸ್ಥಳ ತಪಾಸಣೆ (site visit) ಫೋಟೋ ಸಾಕ್ಷ್ಯಕ್ಕೆ ವಿರುದ್ಧವಾಗಿದೆಯೇ?" },
    ],
  },
  {
    id: "S12",
    titleEn: "Road-cutting permission",
    titleKn: "ರಸ್ತೆ ಅಗೆತ ಅನುಮತಿ",
    range: "Q125-134",
    legalBasis:
      "G.O. NAAI 210 MNY 2017 + BBMP/GBA Act Sec.246-249 + IRC SP-55 — road cutting needs OFC-IMS permission, fee, info board (Cl.11); cutting a road under 1 year old is prohibited (Cl.13); restoration cost lies on the cutter (Cl.16).",
    questions: [
      { code: "Q125", severity: "ORANGE", en: "Is there OFC-IMS portal permission for the road cutting?", kn: "ರಸ್ತೆ ಅಗೆತಕ್ಕೆ OFC-IMS ಪೋರ್ಟಲ್ ಅನುಮತಿ ಇದೆಯೇ?" },
      { code: "Q126", severity: "AMBER", en: "Is there a cutting-fee payment receipt?", kn: "ಅಗೆತ ಶುಲ್ಕ (cutting fee) ಪಾವತಿ ರಸೀದಿ ಇದೆಯೇ?" },
      { code: "Q127", severity: "AMBER", en: "Was the mandatory info board present at the cutting site (Cl.11)?", kn: "ಅಗೆತ ಸ್ಥಳದಲ್ಲಿ ಕಡ್ಡಾಯ ಮಾಹಿತಿ ಫಲಕ ಇತ್ತೇ (Cl.11)?" },
      { code: "Q128", severity: "RED", en: "Was a road less than 1 year old cut (Cl.13 prohibition)?", kn: "1 ವರ್ಷದೊಳಗಿನ ಹೊಸ ರಸ್ತೆ ಕಟಿಂಗ್ ಆಗಿದೆಯೇ (Cl.13 ನಿಷೇಧ)?" },
      { code: "Q129", severity: "ORANGE", en: "Was the ₹25 lakh penalty per cutting (govt / private) applied?", kn: "ಅಗೆತದ ಪ್ರತಿ ಘಟನೆಗೆ ₹25 ಲಕ್ಷ (ಸರ್ಕಾರಿ/ಖಾಸಗಿ) ದಂಡ ಅನ್ವಯವಾಗಿದೆಯೇ?" },
      { code: "Q130", severity: "ORANGE", en: "Is the post-cutting restoration cost charged to the cutter (Cl.16)?", kn: "ಅಗೆತ ನಂತರ ಪುನಃಸ್ಥಾಪನೆ (restoration) ವೆಚ್ಚ ಅಗೆದವರ ಮೇಲೆ ಇದೆಯೇ (Cl.16)?" },
      { code: "Q131", severity: "ORANGE", en: "Is there an NOC from the cross-agencies (BWSSB / BESCOM / GAIL)?", kn: "BWSSB/BESCOM/GAIL ಅಡ್ಡ ಸಂಸ್ಥೆಗಳ NOC ಇದೆಯೇ?" },
      { code: "Q132", severity: "ORANGE", en: "Does the 'Pipe Line cutting' / 'Road Cutting' MB entry match the permission?", kn: "MB ನಲ್ಲಿ 'Pipe Line cutting'/'Road Cutting' ನಮೂದು ಅನುಮತಿಗೆ ಹೊಂದುತ್ತದೆಯೇ?" },
      { code: "Q133", severity: "RED", en: "Was cutting / restoration billed twice to the same contractor?", kn: "ಅಗೆತ/ಪುನಃಸ್ಥಾಪನೆ ಒಂದೇ ಗುತ್ತಿಗೆದಾರನಿಗೆ ಎರಡು ಬಾರಿ ಬಿಲ್ ಆಗಿದೆಯೇ?" },
      { code: "Q134", severity: "AMBER", en: "Is there a restoration quality / safety report?", kn: "ಪುನಃಸ್ಥಾಪನೆ ಗುಣಮಟ್ಟ/ಸುರಕ್ಷೆ ವರದಿ ಇದೆಯೇ?" },
    ],
  },
  {
    id: "S13",
    titleEn: "Environment & NGT",
    titleKn: "ಪರಿಸರ ಮತ್ತು NGT",
    range: "Q135-144",
    legalBasis:
      "NGT orders + KSPCB + C&D Waste Management Rules 2016 + Environment Protection Act — clearance, dust/noise control and protection of drains, lakes and natural flow are mandatory; violations attract environmental compensation.",
    questions: [
      { code: "Q135", severity: "AMBER", en: "Did the work require an environmental NOC / NGT clearance?", kn: "ಕಾಮಗಾರಿಗೆ ಪರಿಸರ NOC/NGT ಕ್ಲಿಯರೆನ್ಸ್ ಅಗತ್ಯವಿತ್ತೇ?" },
      { code: "Q136", severity: "ORANGE", en: "If required, was the NGT clearance obtained?", kn: "ಅಗತ್ಯವಿದ್ದರೆ NGT ಕ್ಲಿಯರೆನ್ಸ್ ಪಡೆಯಲಾಗಿದೆಯೇ?" },
      { code: "Q137", severity: "RED", en: "Is there a storm-water-drain / lake buffer-zone violation?", kn: "ರಾಜಕಾಲುವೆ/ಕೆರೆ buffer zone ಉಲ್ಲಂಘನೆ ಇದೆಯೇ?" },
      { code: "Q138", severity: "AMBER", en: "Were dust / noise control norms followed?", kn: "ಧೂಳು/ಶಬ್ದ ನಿಯಂತ್ರಣ ಮಾನದಂಡ ಪಾಲನೆ ಆಗಿದೆಯೇ?" },
      { code: "Q139", severity: "ORANGE", en: "If trees were felled, is there Forest Department permission?", kn: "ಮರ ಕಡಿಯುವಿಕೆ ಇದ್ದರೆ ಅರಣ್ಯ ಇಲಾಖೆ ಅನುಮತಿ ಇದೆಯೇ?" },
      { code: "Q140", severity: "ORANGE", en: "Was the C&D waste sent to an authorised processing plant?", kn: "C&D ತ್ಯಾಜ್ಯ ಅಧಿಕೃತ ಸಂಸ್ಕರಣಾ ಘಟಕಕ್ಕೆ ಹೋಗಿದೆಯೇ?" },
      { code: "Q141", severity: "ORANGE", en: "Was the storm-water / sewage line damaged?", kn: "ಮಳೆನೀರು ಚರಂಡಿ/ಒಳಚರಂಡಿ ಮಾರ್ಗ ಹಾಳಾಗಿದೆಯೇ?" },
      { code: "Q142", severity: "ORANGE", en: "Was a penalty applied for the environmental violation?", kn: "ಪರಿಸರ ಉಲ್ಲಂಘನೆಗೆ ದಂಡ ಅನ್ವಯವಾಗಿದೆಯೇ?" },
      { code: "Q143", severity: "ORANGE", en: "Was a water source / natural flow obstructed?", kn: "ನೀರಿನ ಮೂಲ/ನೈಸರ್ಗಿಕ ಹರಿವು ತಡೆ ಆಗಿದೆಯೇ?" },
      { code: "Q144", severity: "ORANGE", en: "Is the environmental violation contrary to the sanction conditions?", kn: "ಪರಿಸರ ಉಲ್ಲಂಘನೆ ಕಾಮಗಾರಿ ಮಂಜೂರಾತಿ ಷರತ್ತಿಗೆ ವಿರುದ್ಧವೇ?" },
    ],
  },
  {
    id: "S14",
    titleEn: "Royalty & materials",
    titleKn: "ರಾಯಧನ ಮತ್ತು ಸಾಮಗ್ರಿ",
    range: "Q145-152",
    legalBasis:
      "Mines & Geology (MMDR) Act + MoRTH material standards — royalty (MDP) is due on aggregate/sand with a DMG challan; material must come from an authorised source; unpaid royalty must be deducted.",
    questions: [
      { code: "Q145", severity: "ORANGE", en: "Has royalty been paid for the aggregate / sand / materials?", kn: "ಜಲ್ಲಿ/ಮರಳು/ಸಾಮಗ್ರಿಗೆ ರಾಯಧನ (royalty) ಕಟ್ಟಲಾಗಿದೆಯೇ?" },
      { code: "Q146", severity: "ORANGE", en: "Is there a royalty receipt / permit record?", kn: "ರಾಯಧನ ರಸೀದಿ/permit ದಾಖಲೆ ಇದೆಯೇ?" },
      { code: "Q147", severity: "AMBER", en: "Is there a record of the material source (authorised quarry / supplier)?", kn: "ಸಾಮಗ್ರಿ ಮೂಲ (ಅಧಿಕೃತ ಕ್ವಾರಿ/ಪೂರೈಕೆದಾರ) ದಾಖಲೆ ಇದೆಯೇ?" },
      { code: "Q148", severity: "ORANGE", en: "Does the batch / mix-plant challan count match the quantity?", kn: "ಬ್ಯಾಚ್ ಪ್ಲಾಂಟ್/ಮಿಕ್ಸ್ ಪ್ಲಾಂಟ್ challan ಸಂಖ್ಯೆ ಪ್ರಮಾಣಕ್ಕೆ ಹೊಂದುತ್ತದೆಯೇ?" },
      { code: "Q149", severity: "ORANGE", en: "Do the bitumen / cement purchase receipts match the billed quantity?", kn: "ಬಿಟುಮೆನ್/ಸಿಮೆಂಟ್ ಖರೀದಿ ರಸೀದಿ ಬಿಲ್ ಪ್ರಮಾಣಕ್ಕೆ ಹೊಂದುತ್ತದೆಯೇ?" },
      { code: "Q150", severity: "RED", en: "Is there a suspicion of illegal mining / royalty evasion?", kn: "ಅಕ್ರಮ ಗಣಿಗಾರಿಕೆ/ರಾಯಧನ ವಂಚನೆ ಶಂಕೆ ಇದೆಯೇ?" },
      { code: "Q151", severity: "ORANGE", en: "If royalty was unpaid, was it deducted from the bill?", kn: "ರಾಯಧನ ಕಟ್ಟದಿದ್ದರೆ ಬಿಲ್‌ನಿಂದ ಕಡಿತ ಮಾಡಲಾಗಿದೆಯೇ?" },
      { code: "Q152", severity: "AMBER", en: "Is there a material quality certificate (manufacturer test)?", kn: "ಸಾಮಗ್ರಿ ಗುಣಮಟ್ಟ ಪ್ರಮಾಣ ಪತ್ರ (manufacturer test) ಇದೆಯೇ?" },
    ],
  },
  {
    id: "S15",
    titleEn: "Fake works & duplicate bills",
    titleKn: "ನಕಲಿ ಕಾಮಗಾರಿ ಮತ್ತು ದ್ವಿಗುಣ ಬಿಲ್",
    range: "Q153-160",
    legalBasis:
      "Karnataka Financial Code + KTPP Act + Bharatiya Nyaya Sanhita (BNS) 2023 Sec.316/318 — duplicate billing, paper-only works and reused records are indicators of cheating and fabrication; the loss is recoverable.",
    questions: [
      { code: "Q153", severity: "RED", en: "Has the same road / chainage been billed under two job codes?", kn: "ಒಂದೇ ರಸ್ತೆ/ಚೈನೇಜ್‌ಗೆ ಎರಡು ಜಾಬ್ ಕೋಡ್‌ನಲ್ಲಿ ಬಿಲ್ ಆಗಿದೆಯೇ?" },
      { code: "Q154", severity: "RED", en: "Is the same location repeated in an adjacent work's MB?", kn: "ಪಕ್ಕದ ಕಾಮಗಾರಿಯ MB ನಲ್ಲಿ ಅದೇ ಸ್ಥಳ ಪುನರಾವರ್ತನೆ ಆಗಿದೆಯೇ?" },
      { code: "Q155", severity: "RED", en: "Has the same road done last year been billed again?", kn: "ಹಿಂದಿನ ವರ್ಷ ಮಾಡಿದ ಅದೇ ರಸ್ತೆ ಮತ್ತೆ ಬಿಲ್ ಆಗಿದೆಯೇ?" },
      { code: "Q156", severity: "RED", en: "Is there a suspicion of paper-only work (no actual work done)?", kn: "ಕಾಗದದಲ್ಲಿ ಮಾತ್ರ ಇರುವ (ನಿಜ ಕೆಲಸ ಇಲ್ಲದ) ಕಾಮಗಾರಿ ಶಂಕೆ ಇದೆಯೇ?" },
      { code: "Q157", severity: "RED", en: "Do the measurements shown in the MB match the real site?", kn: "MB ನಲ್ಲಿ ತೋರಿಸಿದ ಅಳತೆ ನಿಜ ಸ್ಥಳಕ್ಕೆ ಹೊಂದುತ್ತದೆಯೇ?" },
      { code: "Q158", severity: "RED", en: "Has the same photo / document been used for multiple bills (cross-link)?", kn: "ಒಂದೇ ಫೋಟೋ/ದಾಖಲೆ ಬಹು ಬಿಲ್‌ಗೆ ಬಳಕೆ ಆಗಿದೆಯೇ (cross-link)?" },
      { code: "Q159", severity: "RED", en: "Has one contractor shown an impossible number of works in one period?", kn: "ಒಂದೇ ಅವಧಿಯಲ್ಲಿ ಒಂದೇ ಗುತ್ತಿಗೆದಾರ ಅಸಾಧ್ಯ ಸಂಖ್ಯೆಯ ಕೆಲಸ ತೋರಿಸಿದ್ದಾರೆಯೇ?" },
      { code: "Q160", severity: "RED", en: "What is the total loss from duplicate / fake bills?", kn: "ದ್ವಿಗುಣ/ನಕಲಿ ಬಿಲ್‌ನಿಂದ ಸಂಭವಿಸಿದ ಒಟ್ಟು ನಷ್ಟ ಎಷ್ಟು?" },
    ],
  },
  {
    id: "S16",
    titleEn: "TVCC & pre-payment check",
    titleKn: "TVCC ಮತ್ತು ಪಾವತಿ ಪೂರ್ವ ತಪಾಸಣೆ",
    range: "Q161-168",
    legalBasis:
      "BBMP/GBA circulars + TVCC inspection order + KW-4 Cl.35 — pre-payment technical-vigilance and test-check at AEE/EE/CE level are mandatory; paying without them fixes responsibility on the certifying officer.",
    questions: [
      { code: "Q161", severity: "ORANGE", en: "Was a pre-payment TVCC (Technical Vigilance Cell) inspection done?", kn: "ಪಾವತಿ ಮುನ್ನ TVCC (ತಾಂತ್ರಿಕ ಜಾಗೃತ ಕೋಶ) ತಪಾಸಣೆ ಆಗಿದೆಯೇ?" },
      { code: "Q162", severity: "AMBER", en: "Is the TVCC inspection report attached to the bill?", kn: "TVCC ತಪಾಸಣಾ ವರದಿ ಬಿಲ್‌ಗೆ ಲಗತ್ತಾಗಿದೆಯೇ?" },
      { code: "Q163", severity: "ORANGE", en: "Was any lapse noted in the TVCC report — and was it acted upon?", kn: "TVCC ವರದಿಯಲ್ಲಿ ಯಾವುದೇ ಲೋಪ ದಾಖಲಾಗಿದೆಯೇ — ಅದಕ್ಕೆ ಕ್ರಮ ಆಗಿದೆಯೇ?" },
      { code: "Q164", severity: "AMBER", en: "Was the test-check (AEE level) done per the supervisory norms?", kn: "Test Check (AEE ಮಟ್ಟ) ಮೇಲ್ವಿಚಾರಣಾ ಮಾನದಂಡ ಪ್ರಕಾರ ಆಗಿದೆಯೇ?" },
      { code: "Q165", severity: "AMBER", en: "Is there a higher-level inspection (EE / CE check) record?", kn: "ಮೇಲ್ಮಟ್ಟದ ತಪಾಸಣೆ (EE/CE check) ದಾಖಲೆ ಇದೆಯೇ?" },
      { code: "Q166", severity: "ORANGE", en: "Were all pre-conditions for payment certification met (KW-4 Cl.35)?", kn: "ಪಾವತಿ ಪ್ರಮಾಣೀಕರಣಕ್ಕೆ (KW-4 Cl.35) ಎಲ್ಲ ಪೂರ್ವಷರತ್ತು ಪೂರೈಸಿದೆಯೇ?" },
      { code: "Q167", severity: "RED", en: "If payment was made without inspection, which officer is responsible?", kn: "ತಪಾಸಣೆ ಆಗದೆ ಪಾವತಿ ಆಗಿದ್ದರೆ — ಯಾವ ಅಧಿಕಾರಿ ಜವಾಬ್ದಾರ?" },
      { code: "Q168", severity: "ORANGE", en: "Is there an internal-audit objection on record?", kn: "ಆಂತರಿಕ ಲೆಕ್ಕಪರಿಶೋಧನೆ (internal audit) ಆಕ್ಷೇಪಣೆ ಇದೆಯೇ?" },
    ],
  },
  {
    id: "S17",
    titleEn: "Payment status & recovery",
    titleKn: "ಪಾವತಿ ಸ್ಥಿತಿ ಮತ್ತು ವಸೂಲಿ",
    range: "Q169-180",
    legalBasis:
      "RTI Act 2005 Sec.6(1)/7(1) + Lokayukta Act 1984 + recovery rules — if unpaid, a stop-payment request lies; if paid, excess is recoverable from the contractor or the responsible officer through the escalation chain.",
    questions: [
      { code: "Q169", severity: "AMBER", en: "Is the bill paid (CLOSED) or still pending?", kn: "ಬಿಲ್ ಪಾವತಿ ಆಗಿದೆಯೇ (CLOSE) ಅಥವಾ ಬಾಕಿ ಇದೆಯೇ?" },
      { code: "Q170", severity: "ORANGE", en: "If unpaid, is there still time to file a Stop-Payment request?", kn: "ಪಾವತಿ ಆಗಿಲ್ಲದಿದ್ದರೆ — Stop Payment ಮನವಿ ಸಲ್ಲಿಸಲು ಸಮಯ ಇದೆಯೇ?" },
      { code: "Q171", severity: "ORANGE", en: "If paid, can an excess-amount recovery case be made out?", kn: "ಪಾವತಿ ಆಗಿದ್ದರೆ — ಹೆಚ್ಚುವರಿ ಮೊತ್ತ ವಸೂಲಿ ಪ್ರಕರಣ ಆಗುತ್ತದೆಯೇ?" },
      { code: "Q172", severity: "ORANGE", en: "What is the total suspect amount (all sections together) — in words too?", kn: "ಒಟ್ಟು ಪ್ರವಾಹ ಮೊತ್ತ (ಎಲ್ಲ ವಿಭಾಗ ಸೇರಿ) ಎಷ್ಟು — ಅಕ್ಷರ ಸಹಿತ?" },
      { code: "Q173", severity: "RED", en: "What is the definite calculated loss (125% + LD + salvage)?", kn: "ಖಚಿತ ಲೆಕ್ಕದ ನಷ್ಟ (125% + LD + ಸಾಲ್ವೇಜ್) ಎಷ್ಟು?" },
      { code: "Q174", severity: "ORANGE", en: "What is the suspect amount lacking records (quality / photo)?", kn: "ದಾಖಲೆ ಇಲ್ಲದ (ಗುಣಮಟ್ಟ/ಫೋಟೋ) ಪ್ರವಾಹ ಮೊತ್ತ ಎಷ್ಟು?" },
      { code: "Q175", severity: "AMBER", en: "Which records should be sought under RTI (the list)?", kn: "RTI ಅಡಿ ಯಾವ ದಾಖಲೆ ಕೋರಬೇಕು (ಪಟ್ಟಿ)?" },
      { code: "Q176", severity: "AMBER", en: "Are the 30-day RTI reply deadline and 15-day complaint deadline set?", kn: "30 ದಿನದ RTI ಉತ್ತರ ಗಡುವು ಮತ್ತು 15 ದಿನದ ದೂರು ಗಡುವು ನಿಗದಿ ಆಗಿದೆಯೇ?" },
      { code: "Q177", severity: "ORANGE", en: "Should recovery be from the contractor or the responsible officer — from whom?", kn: "ವಸೂಲಿಯನ್ನು ಗುತ್ತಿಗೆದಾರ ಅಥವಾ ಜವಾಬ್ದಾರಿ ಅಧಿಕಾರಿ — ಯಾರಿಂದ?" },
      { code: "Q178", severity: "AMBER", en: "Is the escalation chain (AEE → EE → CE → Commissioner → Lokayukta → ACB) ready?", kn: "ಎಸ್ಕಲೇಶನ್ ಸರಣಿ (AEE → EE → CE → ಆಯುಕ್ತ → ಲೋಕಾಯುಕ್ತ → ACB) ಸಿದ್ಧವೇ?" },
      { code: "Q179", severity: "ORANGE", en: "Which officer is responsible on which ground — is it mapped?", kn: "ಯಾವ ಅಧಿಕಾರಿಗೆ ಯಾವ ಆಧಾರಕ್ಕೆ ಜವಾಬ್ದಾರಿ — ಮ್ಯಾಪಿಂಗ್ ಆಗಿದೆಯೇ?" },
      { code: "Q180", severity: "AMBER", en: "Is the final complaint / bill-stop letter (official form) ready?", kn: "ಅಂತಿಮ ದೂರು/ಬಿಲ್ ಸ್ಟಾಪ್ ಪತ್ರ (ಸತ್ಯಧಾರಿ ಸ್ವರೂಪ) ತಯಾರಾಗಿದೆಯೇ?" },
    ],
  },
];

/** Quick lookup: question code → { section, question }. */
export const ROAD_WORK_180_BY_CODE: Record<
  string,
  { section: RoadWorkSection; question: { code: string; en: string; kn: string; severity: "RED" | "ORANGE" | "AMBER" } }
> = (() => {
  const map: Record<string, { section: RoadWorkSection; question: { code: string; en: string; kn: string; severity: "RED" | "ORANGE" | "AMBER" } }> = {};
  for (const s of ROAD_WORK_180) {
    for (const q of s.questions) {
      if ("code" in q) map[q.code] = { section: s, question: q };
    }
  }
  return map;
})();

/**
 * Dev/test guard: the bank must hold exactly Q1..Q180 with no gaps or dupes.
 * Throws with a precise message so vitest pinpoints any transcription slip.
 */
export function assertContiguousCodes(sections: RoadWorkSection[] = ROAD_WORK_180): void {
  const seen = new Set<number>();
  for (const s of sections) {
    for (const q of s.questions) {
      if (!("code" in q)) continue;
      const n = Number(q.code.replace(/^Q/, ""));
      if (!Number.isInteger(n)) throw new Error(`Bad question code: ${q.code}`);
      if (seen.has(n)) throw new Error(`Duplicate question code: ${q.code}`);
      seen.add(n);
    }
  }
  for (let i = 1; i <= 180; i++) {
    if (!seen.has(i)) throw new Error(`Missing question code: Q${i}`);
  }
  if (seen.size !== 180) throw new Error(`Expected 180 questions, found ${seen.size}`);
}
