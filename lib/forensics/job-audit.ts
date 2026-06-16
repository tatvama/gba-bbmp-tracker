/**
 * Job-number forensic orchestrator (PURE). Aggregates structured inputs for ONE
 * job, runs every deterministic engine, enriches each finding with category /
 * evidence grade / risk points, computes loss exposure + an aggregate risk
 * score/band, and returns a ranked JobAuditReport. AI does the extraction that
 * feeds this; this layer does the judging and is fully unit-testable.
 */
import type {
  BillFinding, StructuredBill, ScheduleBItem, RunningBill, JobTimelineDates,
  EligibilityRequirement, InsurancePolicy, CheckCategory,
} from "./types";
import { runBillRules, checkDeductionMath, checkQuantityOverrun, checkRateAbuse, type DeductionContext } from "./rule-engine";
import { checkChronology } from "./chronology";
import { checkEligibility } from "./eligibility";
import { checkInsurance, checkSecurityFsd, type InsuranceContext } from "./insurance-security";
import { checkMbIntegrity, type MbIntegrityInput } from "./mb-integrity";
import { reconcileRoyalty, reconcileSalvage, reconcileDisposal } from "./royalty-salvage";
import { computeLossExposure, type LossLineInput } from "./loss-exposure";
import { gradeEvidence, scoreFinding, scoreJobRisk, type JobRisk } from "./risk-score";
import type { SrRate } from "./rate-check";

export interface DocumentMatrixRow {
  docType: string;
  present: boolean;
  date?: string | null;
  source?: string | null;
}

export interface JobAuditInput {
  jobNumber: string;
  bills?: StructuredBill[];
  scheduleB?: ScheduleBItem[];
  runningBills?: RunningBill[];
  timeline?: JobTimelineDates;
  eligibility?: EligibilityRequirement[];
  insurance?: { policies: InsurancePolicy[]; ctx: InsuranceContext };
  fsd?: { fsdDeductedByBill: number[]; required?: number; actual?: number };
  royalty?: { billedMaterialQty: number; royaltyPaidQty?: number; royaltyRate?: number; material?: string }[];
  salvage?: { dismantlingQty?: number; salvageRegistered?: boolean; salvageQty?: number; salvageRate?: number }[];
  disposal?: { excavationQty?: number; disposalQty?: number; hasTripSheets: boolean; hasWeighbridge: boolean }[];
  mb?: MbIntegrityInput;
  agreementRates?: Record<string, number>;
  srBook?: SrRate[];
  deductionCtx?: DeductionContext;
  rateOpts?: { billDate?: string | null; earthworkSharePct?: number };
  documentsForMatrix?: DocumentMatrixRow[];
  lossLines?: LossLineInput[];
}

export interface JobAuditReport {
  jobNumber: string;
  documentMatrix: DocumentMatrixRow[];
  findings: BillFinding[];
  rankedFindings: BillFinding[];
  risk: JobRisk;
  loss: { lines: { type: string; label: string; exposure: number; formula: string; caveat: string }[]; totalPossibleExposure: number };
  counts: { findings: number; redFlags: number };
}

/** Best-effort category inference for base rule-engine findings lacking one. */
function inferCategory(code: string): CheckCategory {
  if (code.startsWith("ARITH") || code === "ROUND_NUMBER" || code === "THRESHOLD") return "ARITHMETIC";
  if (code.startsWith("TAX") || code.startsWith("REC") || code.startsWith("DD")) return "DEDUCTION";
  if (code.startsWith("RATE") || code.startsWith("RT-")) return "RATE";
  if (code.startsWith("QT") || code === "EXCESS_SANCTION" || code === "NEGATIVE") return "QUANTITY";
  return "ARITHMETIC";
}

export function runJobAudit(input: JobAuditInput): JobAuditReport {
  const findings: BillFinding[] = [];

  for (const bill of input.bills ?? []) {
    findings.push(...runBillRules(bill));
    if (input.deductionCtx) findings.push(...checkDeductionMath(bill, input.deductionCtx));
  }
  if (input.scheduleB?.length) {
    findings.push(...checkQuantityOverrun(input.scheduleB));
    findings.push(...checkRateAbuse(input.scheduleB, new Map(Object.entries(input.agreementRates ?? {})), input.srBook ?? [], input.rateOpts));
  }
  if (input.timeline) findings.push(...checkChronology(input.timeline));
  if (input.eligibility?.length) findings.push(...checkEligibility(input.eligibility));
  if (input.insurance) findings.push(...checkInsurance(input.insurance.policies, input.insurance.ctx));
  if (input.fsd) findings.push(...checkSecurityFsd(input.runningBills ?? [], input.fsd));
  if (input.mb || input.runningBills) findings.push(...checkMbIntegrity({ ...(input.mb ?? {}), runningBills: input.mb?.runningBills ?? input.runningBills }));
  for (const r of input.royalty ?? []) findings.push(...reconcileRoyalty(r));
  for (const s of input.salvage ?? []) findings.push(...reconcileSalvage(s));
  for (const d of input.disposal ?? []) findings.push(...reconcileDisposal(d));

  // Enrich: category, evidence grade, risk points.
  for (const f of findings) {
    if (!f.category) f.category = inferCategory(f.code);
    if (!f.evidenceGrade) f.evidenceGrade = gradeEvidence(f);
    if (f.riskPoints == null) f.riskPoints = scoreFinding(f);
  }

  // Loss: explicit lines + any per-finding lossExposure.
  const loss = computeLossExposure(input.lossLines ?? []);
  const findingExposure = findings.reduce((s, f) => s + (f.lossExposure ?? 0), 0);
  loss.totalPossibleExposure = Math.round((loss.totalPossibleExposure + findingExposure) * 100) / 100;

  const rankedFindings = [...findings].sort((a, b) => (b.riskPoints ?? 0) - (a.riskPoints ?? 0));
  const risk = scoreJobRisk(findings);

  return {
    jobNumber: input.jobNumber,
    documentMatrix: input.documentsForMatrix ?? [],
    findings,
    rankedFindings,
    risk,
    loss,
    counts: { findings: findings.length, redFlags: findings.filter((f) => f.severity !== "Low").length },
  };
}
