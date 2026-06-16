/** Shared, framework-free types for the forensic bill-audit engine. */

export interface BillLineItem {
  slNo?: string | null;
  description: string;
  unit?: string | null;
  qty: number | null;
  rate: number | null;
  amount: number | null;
  srCode?: string | null;
}
export interface BillTax {
  name: string;
  pct: number | null;
  amount: number | null;
}
export interface BillDeduction {
  name: string;
  amount: number | null;
}

export interface StructuredBill {
  billType?: string | null;
  billNo?: string | null;
  billDate?: string | null;
  workOrderRef?: string | null;
  workOrderDate?: string | null;
  sanctionedAmount?: number | null;
  contractor?: string | null;
  lineItems: BillLineItem[];
  taxes: BillTax[];
  deductions: BillDeduction[];
  subTotal?: number | null;
  grandTotal?: number | null;
  netPayable?: number | null;
  /** Names of statutory recoveries the bill shows (royalty, TDS, etc.). */
  recoveriesPresent?: string[];
  confidence?: "High" | "Medium" | "Low";
  needsManualReview?: boolean;
}

export type Severity = "High" | "Medium" | "Low";

export type EvidenceGrade = "A" | "B" | "C" | "D" | "E";
export type RiskBand = "low" | "procedural" | "serious" | "bill_stop";
/** The skill's 6 finding categories — drives safe phrasing. */
export type FindingCategory =
  | "confirmed_mismatch"
  | "missing_proof"
  | "calc_variance"
  | "technical_redflag"
  | "possible_forgery_redflag"
  | "no_issue";
export type EvidenceStrength = "weak" | "moderate" | "strong" | "documentary";
export type CheckCategory =
  | "ARITHMETIC" | "QUANTITY" | "RATE" | "DEDUCTION" | "CHRONOLOGY"
  | "ELIGIBILITY" | "INSURANCE" | "ROYALTY" | "MB_INTEGRITY" | "PHOTO"
  | "PATTERN" | "LOSS" | "FORM_INTEGRITY";

export interface BillFinding {
  code: string;
  title: string;
  severity: Severity;
  detail: string;
  expected?: string;
  actual?: string;
  // Forensic enrichment (all optional — existing emitters unaffected)
  category?: CheckCategory;
  findingClass?: FindingCategory;
  evidenceGrade?: EvidenceGrade;
  evidenceStrength?: EvidenceStrength;
  riskPoints?: number;
  valueImpact?: "high" | "medium" | "low";
  lossExposure?: number; // ₹, LOSS category only — "possible exposure"
  recordToDemand?: string;
  ruleRef?: string;
  sourceDocId?: string;
  safeText?: string; // verbatim cautious string
  workedExample?: string; // ಸರಳ ಉದಾಹರಣೆ content
}

// ── Structured inputs for the job-audit engines ─────────────────────────────

export interface JobTimelineDates {
  [event: string]: string | null;
}

export interface EligibilityRequirement {
  key: string;
  label: string;
  operator: "present" | ">=" | "<=" | ">" | "<" | "==" | "contains" | "class_ge";
  required?: string | number;
  actual?: string | number | null;
  critical?: boolean;
}

export interface InsurancePolicy {
  type: string;
  start?: string | null;
  end?: string | null;
  sumInsured?: number | null;
  premiumReceipt?: boolean;
  authorityNamed?: boolean;
}

export interface RunningBill {
  billNo?: string | null;
  billDate?: string | null;
  itemCode?: string | null;
  previousMeasurement?: number | null;
  thisBill?: number | null;
  totalUptoDate?: number | null;
}

export interface ScheduleBItem {
  itemCode?: string | null;
  description: string;
  tenderQty: number | null;
  cumulativeQty: number | null;
  rate?: number | null;
  isHiddenItem?: boolean;
}
