/**
 * Contractor eligibility checks (PURE). Compares tender-specific requirements
 * (passed in — never hardcoded) against the contractor's submitted proof.
 * Missing proof is "not shown in supplied records", not "contractor failed".
 */
import { KW_CLASS_RANK } from "../constants";
import type { BillFinding, EligibilityRequirement } from "./types";

function dec(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[,₹\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}
const norm = (v: unknown) => (v == null ? "" : String(v).trim().toLowerCase());

function classGe(actual: unknown, required: unknown): boolean | null {
  const rank = KW_CLASS_RANK.map((c) => c.toLowerCase());
  const a = norm(actual).replace(/^class[-\s]*/, "");
  const r = norm(required).replace(/^class[-\s]*/, "");
  const ia = rank.indexOf(a), ir = rank.indexOf(r);
  if (ia < 0 || ir < 0) return null;
  return ia >= ir;
}

/** Returns pass/fail/unknown per requirement; emits findings for fail + unknown. */
export function checkEligibility(requirements: EligibilityRequirement[]): BillFinding[] {
  const out: BillFinding[] = [];
  requirements.forEach((req, idx) => {
    const code = `EL-${String(idx + 1).padStart(2, "0")}`;
    const critical = req.critical !== false;
    let status: "pass" | "fail" | "unknown" = "unknown";
    let reason = "";

    if (req.operator === "present") {
      status = req.actual != null && req.actual !== "" ? "pass" : "fail";
      reason = status === "pass" ? "proof present" : "proof not shown in supplied records";
    } else if (req.operator === "class_ge") {
      const ok = classGe(req.actual, req.required);
      if (ok == null) { status = "unknown"; reason = "class value missing or unknown"; }
      else { status = ok ? "pass" : "fail"; reason = ok ? "class sufficient" : `class ${req.actual} below required ${req.required}`; }
    } else if (req.operator === "contains") {
      status = norm(req.actual).includes(norm(req.required)) ? "pass" : "fail";
      reason = status === "pass" ? "required text found" : "required text not found";
    } else if (req.operator === "==") {
      status = norm(req.actual) === norm(req.required) && norm(req.actual) !== "" ? "pass" : "fail";
      reason = status === "pass" ? "matches" : `actual ${req.actual ?? "—"} ≠ required ${req.required ?? "—"}`;
    } else {
      const a = dec(req.actual), r = dec(req.required);
      if (a == null || r == null) { status = "unknown"; reason = "numeric value missing"; }
      else {
        const ok = req.operator === ">=" ? a >= r : req.operator === "<=" ? a <= r : req.operator === ">" ? a > r : a < r;
        status = ok ? "pass" : "fail";
        reason = ok ? `${a} ${req.operator} ${r}` : `actual ${a} does not satisfy ${req.operator} ${r}`;
      }
    }

    if (status === "pass") return;
    const missing = status === "unknown" || req.actual == null || req.actual === "";
    out.push({
      code,
      title: `Eligibility: ${req.label}`,
      severity: status === "fail" && critical ? "High" : "Medium",
      category: "ELIGIBILITY",
      findingClass: missing ? "missing_proof" : "confirmed_mismatch",
      evidenceGrade: missing ? "C" : "A",
      detail: `${req.label}: ${reason}. The supplied records do not presently establish this requirement; production of the official proof may remove the doubt.`,
      expected: req.required != null ? String(req.required) : undefined,
      actual: req.actual != null && req.actual !== "" ? String(req.actual) : undefined,
      ruleRef: "KTPP Act 1999 (Act 29 of 2000) + tender eligibility conditions",
      recordToDemand: `Tender proof for "${req.label}" (technical bid evaluation + certificate)`,
    });
  });
  return out;
}
