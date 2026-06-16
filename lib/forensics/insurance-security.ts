/**
 * Insurance + security/FSD compliance checks (PURE). Never asserts insurance is
 * "fake"; flags which policy/cover is absent or mismatched and demands originals.
 * No 5% FSD default — the required figure is READ from the agreement.
 */
import { parseIndianDate, isAfter } from "./date-parse";
import type { BillFinding, InsurancePolicy, RunningBill } from "./types";

export interface InsuranceContext {
  commencement?: string | null;
  completion?: string | null;
  contractValue?: number | null;
  requiredTypes?: string[]; // default car, workmen, third_party
}

export function checkInsurance(policies: InsurancePolicy[], ctx: InsuranceContext): BillFinding[] {
  const out: BillFinding[] = [];
  const commencement = parseIndianDate(ctx.commencement ?? null);
  const completion = parseIndianDate(ctx.completion ?? null);
  const seen = new Set<string>();

  policies.forEach((p, i) => {
    const tag = (p.type || "").toLowerCase();
    seen.add(tag);
    const start = parseIndianDate(p.start ?? null);
    const end = parseIndianDate(p.end ?? null);
    const base = `IN-${String(i * 5 + 1).padStart(2, "0")}`;
    if (start && commencement && isAfter(start, commencement)) {
      out.push({ code: "IN-01", title: `${p.type}: policy starts after commencement`, severity: "High", category: "INSURANCE", findingClass: "confirmed_mismatch", evidenceGrade: "A", detail: `${p.type} starts ${p.start} but work commenced ${ctx.commencement} — an uninsured period may have shifted risk to the public authority.`, recordToDemand: "Policy schedule + endorsement covering the full work period" });
    }
    if (end && completion && isAfter(completion, end)) {
      out.push({ code: "IN-02", title: `${p.type}: policy expires before completion`, severity: "High", category: "INSURANCE", findingClass: "confirmed_mismatch", evidenceGrade: "A", detail: `${p.type} ends ${p.end} but work completed ${ctx.completion} — a risk gap during execution/DLP.`, recordToDemand: "Extension endorsement covering execution and DLP" });
    }
    if (typeof p.sumInsured === "number" && typeof ctx.contractValue === "number" && p.sumInsured < ctx.contractValue) {
      out.push({ code: "IN-03", title: `${p.type}: sum insured below contract value`, severity: "Medium", category: "INSURANCE", findingClass: "confirmed_mismatch", evidenceGrade: "B", detail: `${p.type} sum insured ₹${p.sumInsured.toLocaleString("en-IN")} is below the contract value ₹${ctx.contractValue.toLocaleString("en-IN")}.`, recordToDemand: "Policy with adequate sum insured" });
    }
    if (p.premiumReceipt === false) {
      out.push({ code: "IN-04", title: `${p.type}: premium receipt not shown`, severity: "Medium", category: "INSURANCE", findingClass: "missing_proof", evidenceGrade: "C", detail: `${p.type} attached without a premium-payment receipt — authenticity/enforceability needs confirmation.`, recordToDemand: "Premium payment receipt + policy verification note" });
    }
    if (p.authorityNamed === false) {
      out.push({ code: "IN-05", title: `${p.type}: public authority not named`, severity: "Medium", category: "INSURANCE", findingClass: "missing_proof", evidenceGrade: "C", detail: `${p.type} does not name BBMP/GBA as principal/beneficiary where required.`, recordToDemand: "Endorsement naming the public authority" });
    }
    void base;
  });

  for (const need of ctx.requiredTypes ?? ["car", "workmen", "third_party"]) {
    if (![...seen].some((s) => s.includes(need.replace("_", " ")) || s.includes(need))) {
      out.push({ code: "IN-06", title: `Required policy not shown: ${need}`, severity: "High", category: "INSURANCE", findingClass: "missing_proof", evidenceGrade: "C", detail: `No ${need} policy is present in the supplied records (KW-4 requires it). Production may remove the doubt.`, recordToDemand: `${need} insurance policy + premium receipt` });
    }
  }
  return out;
}

export interface SecurityOptions {
  fsdDeductedByBill: number[];
  required?: number; // performance security required (READ from agreement)
  actual?: number;
}

export function checkSecurityFsd(_bills: RunningBill[], opts: SecurityOptions): BillFinding[] {
  const out: BillFinding[] = [];
  opts.fsdDeductedByBill.forEach((v, i) => {
    if (!(Number(v) > 0)) {
      out.push({ code: "DD-01", title: `FSD/security not deducted in running bill ${i + 1}`, severity: "High", category: "DEDUCTION", findingClass: "confirmed_mismatch", evidenceGrade: "B", detail: `Bill ${i + 1} shows no FSD/security-deposit deduction. A direct recoverable amount may have been omitted unless a valid exemption exists.`, recordToDemand: "FSD/security deduction ledger + KW-4 security clause" });
    }
  });
  if (typeof opts.required === "number" && typeof opts.actual === "number" && opts.actual < opts.required) {
    out.push({ code: "IN-07", title: "Performance security shortfall", severity: "High", category: "INSURANCE", findingClass: "confirmed_mismatch", evidenceGrade: "B", detail: `Performance security ₹${opts.actual.toLocaleString("en-IN")} is below the required ₹${opts.required.toLocaleString("en-IN")}.`, expected: `≥ ₹${opts.required.toLocaleString("en-IN")}`, actual: `₹${opts.actual.toLocaleString("en-IN")}`, recordToDemand: "Bank guarantee / performance security covering the required value" });
  } else if (opts.required == null && opts.fsdDeductedByBill.length) {
    out.push({ code: "IN-08", title: "FSD/security figure not in supplied records", severity: "Low", category: "INSURANCE", findingClass: "missing_proof", evidenceGrade: "C", detail: "The required FSD/performance-security figure is not in the supplied records. Verify against the KW-4 agreement clause before concluding any shortfall.", recordToDemand: "KW-4 security clause + agreement" });
  }
  return out;
}
