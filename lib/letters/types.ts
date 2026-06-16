/** Pure, framework-free types for the Kannada/bilingual letter generator. */
import type { LetterVariant, SignatoryKey } from "@/lib/constants";

export type { LetterVariant, SignatoryKey };
export type LetterLanguage = "Kannada" | "Bilingual";

/** A forensic finding projected into the letter layer (ground block). */
export interface LetterFinding {
  code: string;
  title: string;
  severity: "High" | "Medium" | "Low";
  docRef?: string; // Annexure N, page, item
  observation: string; // exact figure / fact
  mismatch?: string; // conflicting record or missing proof
  suspicionReason?: string; // why it matters
  workedExample?: string; // ಸರಳ ಉದಾಹರಣೆ
  ruleBasis?: string; // KW clause / statute / ruling
  recordDemand?: string; // exact record to produce
  responsibleOfficer?: string; // AE / AEE / EE / committee
  evidenceGrade?: string; // A–E
  riskScore?: number;
}

export interface PaymentRow { billNo: string; date: string; gross: string; deductions: string; cheque: string; cumulative: string }
export interface QuantityRow { item: string; description: string; originalQty: string; modifiedQty: string; cumulativeQty: string; pctOfTender: number | null }
export interface EvidenceIndexRow { annexure: string; document: string; date: string; page: string; item: string; factProved: string; findingSupported: string; evidenceGrade: string; recordDemanded: string }
export interface OfficerResponsibilityRow { officer: string; dutyArea: string; recordExpected: string; findingLinked: string; actionRequested: string }
export interface SummaryBoxRow { slNo: number; ground: string; documentReference: string; whySuspicious: string; risk: string; recordDemanded: string }

export interface RenderedGroundLabel { label: string; value: string; styleKey: string }
export interface RenderedGround { number: number; title: string; labels: RenderedGroundLabel[] }

export interface LetterContext {
  jobCode: string;
  ward?: string | null;
  workName?: string | null;
  contractor?: string | null;
  division?: string | null;
  variant: LetterVariant;
  language: LetterLanguage;
  signatoryKey: SignatoryKey;
  lokayuktaRef?: string | null;
  findings: LetterFinding[];
  payments?: PaymentRow[];
  quantities?: QuantityRow[];
  /** Free-text references that must be whitelisted by the linter (job code etc.). */
  references?: string[];
}

export interface LetterSkeleton {
  title: string;
  fromBlock: string[];
  toBlock: string[];
  subject: string;
  references: string[];
  introduction: string;
  summaryBox: SummaryBoxRow[];
  grounds: RenderedGround[];
  demands: string[];
  escalation: string;
  closing: string[];
  evidenceIndex: EvidenceIndexRow[];
  officerResponsibility: OfficerResponsibilityRow[];
  caveat: string;
}
