/**
 * Measurement-Book integrity checks (PURE). Reconciles carry-forward across
 * running bills, checks L×B×D vs quantity, abstract vs detail, MB date window,
 * and surfaces form-integrity flags as cautious "requires original verification"
 * red flags (grade D, possible_forgery_redflag) — never an assertion of forgery.
 */
import { parseIndianDate, isAfter } from "./date-parse";
import type { BillFinding, RunningBill, ScheduleBItem } from "./types";

const tol = (a: number, b: number, abs = 1, pct = 1) => {
  const diff = Math.abs(a - b);
  return diff > abs && diff > (Math.abs(b) * pct) / 100;
};

/** Previous-measurement of bill N must equal total-up-to-date of bill N-1 (per item). */
export function reconcileCarryForward(bills: RunningBill[]): BillFinding[] {
  const out: BillFinding[] = [];
  const byItem = new Map<string, RunningBill[]>();
  for (const b of bills) {
    const k = b.itemCode ?? "_";
    (byItem.get(k) ?? byItem.set(k, []).get(k)!).push(b);
  }
  for (const [item, list] of byItem) {
    const sorted = [...list].sort(
      (a, b) => (parseIndianDate(a.billDate ?? null)?.getTime() ?? 0) - (parseIndianDate(b.billDate ?? null)?.getTime() ?? 0),
    );
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!, cur = sorted[i]!;
      const prevTotal = prev.totalUptoDate, curPrev = cur.previousMeasurement;
      if (typeof prevTotal === "number" && typeof curPrev === "number" && tol(curPrev, prevTotal)) {
        out.push({
          code: "MB-02",
          title: `Carry-forward break (item ${item})`,
          severity: "High",
          category: "MB_INTEGRITY",
          findingClass: "confirmed_mismatch",
          evidenceGrade: "A",
          detail: `Item ${item}: bill ${cur.billNo ?? "?"} shows previous measurement ${curPrev} but the prior bill's total-up-to-date is ${prevTotal}.`,
          expected: String(prevTotal),
          actual: String(curPrev),
          recordToDemand: "Complete MB book pages + abstract reconciling the cumulative quantity",
        });
      }
    }
  }
  return out;
}

export interface MbIntegrityInput {
  items?: ScheduleBItem[];
  runningBills?: RunningBill[];
  dims?: { itemCode?: string; L: number; B: number; D: number; qty: number }[];
  mbDate?: string | null;
  woDate?: string | null;
  billDate?: string | null;
  /** Visual-review booleans (from form-integrity AI / manual review). */
  formFlags?: Record<string, boolean>;
}

const FORM_FLAGS: Record<string, { title: string; severity: "High" | "Medium" }> = {
  blank_signed: { title: "Form appears signed with critical fields blank", severity: "Medium" },
  overwriting_without_initials: { title: "Correction/overwriting without initials", severity: "Medium" },
  identical_signature_image: { title: "Identical signature image repeated", severity: "High" },
  scan_patch: { title: "Scan shows patch / white box / possible paste", severity: "High" },
  words_vs_figures_mismatch: { title: "Amount in words differs from figures", severity: "High" },
  missing_signature: { title: "Expected AE/AEE/EE signature missing", severity: "Medium" },
};
const FORM_SAFE = "This is a possible document-integrity red flag only. The original record, upload log, metadata and expert verification are required; it is not a finding of forgery.";

export function checkMbIntegrity(input: MbIntegrityInput): BillFinding[] {
  const out: BillFinding[] = [];

  if (input.runningBills) out.push(...reconcileCarryForward(input.runningBills));

  for (const dim of input.dims ?? []) {
    const computed = dim.L * dim.B * dim.D;
    if (tol(dim.qty, computed)) {
      out.push({
        code: "MB-03",
        title: `L×B×D ≠ quantity (item ${dim.itemCode ?? "?"})`,
        severity: "High",
        category: "MB_INTEGRITY",
        findingClass: "confirmed_mismatch",
        evidenceGrade: "B",
        detail: `Item ${dim.itemCode ?? "?"}: ${dim.L} × ${dim.B} × ${dim.D} = ${computed.toFixed(2)}, but the MB shows ${dim.qty}.`,
        expected: computed.toFixed(2),
        actual: String(dim.qty),
        recordToDemand: "MB calculation sheet for this item",
      });
    }
  }

  // MB date must sit between work-order and bill dates.
  const mb = parseIndianDate(input.mbDate ?? null);
  const wo = parseIndianDate(input.woDate ?? null);
  const bill = parseIndianDate(input.billDate ?? null);
  if (mb && wo && isAfter(wo, mb)) {
    out.push({ code: "MB-10", title: "Measurement dated before work order", severity: "High", category: "MB_INTEGRITY", findingClass: "confirmed_mismatch", evidenceGrade: "A", detail: `MB date ${input.mbDate} is before the work order ${input.woDate}.`, recordToDemand: "Original MB + work order with dates" });
  }
  if (mb && bill && isAfter(mb, bill)) {
    out.push({ code: "MB-10b", title: "Bill dated before measurement", severity: "High", category: "MB_INTEGRITY", findingClass: "confirmed_mismatch", evidenceGrade: "A", detail: `Bill date ${input.billDate} is before the MB measurement ${input.mbDate}.`, recordToDemand: "Original MB + bill with dates" });
  }

  // MB quantity vs Schedule-B quantity (gross over-measure).
  for (const it of input.items ?? []) {
    if (typeof it.tenderQty === "number" && typeof it.cumulativeQty === "number" && it.tenderQty > 0 && it.cumulativeQty > it.tenderQty * 3) {
      out.push({ code: "MB-11", title: `MB quantity far exceeds Schedule B (item ${it.itemCode ?? it.description.slice(0, 24)})`, severity: "High", category: "MB_INTEGRITY", findingClass: "confirmed_mismatch", evidenceGrade: "B", detail: `Cumulative ${it.cumulativeQty} vs tender ${it.tenderQty} (>300%) — verify the measurement basis.`, recordToDemand: "Detailed MB measurement + revised sanction" });
    }
  }

  for (const [flag, on] of Object.entries(input.formFlags ?? {})) {
    if (on && FORM_FLAGS[flag]) {
      out.push({
        code: `MB-FORM-${flag}`,
        title: FORM_FLAGS[flag]!.title,
        severity: FORM_FLAGS[flag]!.severity,
        category: "FORM_INTEGRITY",
        findingClass: "possible_forgery_redflag",
        evidenceGrade: "D",
        detail: `${FORM_FLAGS[flag]!.title}. ${FORM_SAFE}`,
        safeText: FORM_SAFE,
        recordToDemand: "Original physical record, upload log, metadata, expert verification",
      });
    }
  }

  return out;
}
