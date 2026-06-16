import "server-only";
import { extractJson, extractorSystem } from "@/lib/ai/json-extract";
import type {
  RunningBill, ScheduleBItem, JobTimelineDates, EligibilityRequirement, InsurancePolicy,
} from "@/lib/forensics/types";

/**
 * Forensic AI extractors — transcription only, feeding the deterministic engines.
 * Each is env-gated (returns an empty structure with ok:false when AI is off, so
 * the engines still run over any manually-entered structured rows).
 */

// ── MB book / running bill ──────────────────────────────────────────────────
export interface MbExtraction {
  runningBills: RunningBill[];
  scheduleB: ScheduleBItem[];
  mbDate: string | null;
}
export async function extractMbBill(ocr: string) {
  return extractJson<MbExtraction>({
    system: extractorSystem("You transcribe Measurement Book / running-account-bill pages: per-item previous measurement, this-bill, total-up-to-date, and Schedule-B tender vs cumulative quantities."),
    prompt: `OCR:\n"""${ocr.slice(0, 12000)}"""\n\nReturn JSON exactly:\n{"runningBills":[{"billNo":"","billDate":"","itemCode":"","previousMeasurement":null,"thisBill":null,"totalUptoDate":null}],"scheduleB":[{"itemCode":"","description":"","tenderQty":null,"cumulativeQty":null,"rate":null}],"mbDate":null}`,
    fallback: { runningBills: [], scheduleB: [], mbDate: null },
  });
}

// ── Lifecycle dates (chronology) ────────────────────────────────────────────
export async function extractTimelineDates(ocr: string, docType?: string | null) {
  return extractJson<JobTimelineDates>({
    system: extractorSystem("You extract lifecycle dates from a public-works document. Keys to fill only when present: administrative_sanction, technical_sanction, tender_notice, bid_deadline, technical_bid_opening, financial_bid_opening, tender_approval, work_order, agreement, stamp_paper_purchase, insurance_start, commencement, measurement, bill, photo_capture, photo_upload, payment, completion, dlp_end, security_release."),
    prompt: `Document type: ${docType ?? "unknown"}\nOCR:\n"""${ocr.slice(0, 10000)}"""\n\nReturn a flat JSON object of {event: "YYYY-MM-DD" or original date string}; include only events whose date is visible.`,
    fallback: {},
    maxTokens: 1500,
  });
}

// ── Tender eligibility ──────────────────────────────────────────────────────
export interface EligibilityExtraction {
  requirements: EligibilityRequirement[];
}
export async function extractEligibility(ocr: string) {
  return extractJson<EligibilityExtraction>({
    system: extractorSystem("You extract tender eligibility requirements AND the contractor's submitted proof from tender/bid documents. For each requirement give key, human label, operator (present|>=|<=|>|<|==|contains|class_ge), the required value, and the contractor's actual value (null if not shown). Use class_ge for registration class."),
    prompt: `OCR:\n"""${ocr.slice(0, 12000)}"""\n\nReturn JSON exactly:\n{"requirements":[{"key":"","label":"","operator":"present","required":null,"actual":null,"critical":true}]}`,
    fallback: { requirements: [] },
  });
}

// ── Insurance / security ────────────────────────────────────────────────────
export interface InsuranceExtraction {
  policies: InsurancePolicy[];
}
export async function extractInsurance(ocr: string) {
  return extractJson<InsuranceExtraction>({
    system: extractorSystem("You extract insurance policies (CAR, workmen compensation, third-party liability) from policy/agreement documents: type, start, end, sum insured, whether a premium receipt is shown, whether the public authority is named."),
    prompt: `OCR:\n"""${ocr.slice(0, 10000)}"""\n\nReturn JSON exactly:\n{"policies":[{"type":"","start":null,"end":null,"sumInsured":null,"premiumReceipt":false,"authorityNamed":false}]}`,
    fallback: { policies: [] },
  });
}

// ── Royalty / disposal / salvage ────────────────────────────────────────────
export interface RoyaltyExtraction {
  royalty: { billedMaterialQty: number; royaltyPaidQty?: number; royaltyRate?: number; material?: string }[];
  disposal: { excavationQty?: number; disposalQty?: number; hasTripSheets: boolean; hasWeighbridge: boolean }[];
  salvage: { dismantlingQty?: number; salvageRegistered?: boolean; salvageQty?: number; salvageRate?: number }[];
}
export async function extractRoyalty(ocr: string) {
  return extractJson<RoyaltyExtraction>({
    system: extractorSystem("You extract material-source facts: billed material quantity vs royalty-paid quantity (DMG challan), whether trip sheets / weighbridge slips are present, dismantling quantity and whether a salvage register is shown. Never infer rates."),
    prompt: `OCR:\n"""${ocr.slice(0, 10000)}"""\n\nReturn JSON exactly:\n{"royalty":[{"billedMaterialQty":0,"royaltyPaidQty":null,"royaltyRate":null,"material":""}],"disposal":[{"excavationQty":null,"disposalQty":null,"hasTripSheets":false,"hasWeighbridge":false}],"salvage":[{"dismantlingQty":null,"salvageRegistered":false,"salvageQty":null,"salvageRate":null}]}`,
    fallback: { royalty: [], disposal: [], salvage: [] },
  });
}
