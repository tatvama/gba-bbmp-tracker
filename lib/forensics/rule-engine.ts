/**
 * Deterministic bill-audit rule engine (PURE, framework-free, unit-tested).
 * Recomputes arithmetic exactly and applies fixed forensic rules to a structured
 * bill. No AI, no hallucination — every finding states the expected vs actual
 * number and the rule it broke. Findings are indicators for human verification.
 */
import type { BillFinding, StructuredBill, Severity } from "./types";

const DEFAULT_EXPECTED_RECOVERIES = ["Royalty", "Income Tax", "GST", "Security Deposit"];
// Common approval ceilings (₹) — a total sitting just below one suggests splitting.
const APPROVAL_THRESHOLDS = [100_000, 500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000];

export interface RuleOptions {
  tolerancePct?: number; // default 1%
  toleranceAbs?: number; // default ₹1
  expectedRecoveries?: string[];
}

function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** True when a and b differ by more than both tolerances. */
function mismatch(a: number, b: number, tolPct: number, tolAbs: number): boolean {
  const diff = Math.abs(a - b);
  return diff > tolAbs && diff > (Math.abs(b) * tolPct) / 100;
}

const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function runBillRules(bill: StructuredBill, opts: RuleOptions = {}): BillFinding[] {
  const tolPct = opts.tolerancePct ?? 1;
  const tolAbs = opts.toleranceAbs ?? 1;
  const expectedRecoveries = opts.expectedRecoveries ?? DEFAULT_EXPECTED_RECOVERIES;
  const out: BillFinding[] = [];
  const items = bill.lineItems ?? [];

  // 1) Per-line arithmetic: qty × rate = amount.
  items.forEach((li, i) => {
    const q = num(li.qty), r = num(li.rate), a = num(li.amount);
    if (q !== null && r !== null && a !== null) {
      const expected = q * r;
      if (mismatch(a, expected, tolPct, tolAbs)) {
        out.push({
          code: "ARITH_LINE",
          title: `Line ${li.slNo ?? i + 1}: amount ≠ qty × rate`,
          severity: "High",
          detail: `"${(li.description ?? "").slice(0, 60)}": ${q} × ${money(r)} should be ${money(expected)}.`,
          expected: money(expected),
          actual: money(a),
        });
      }
    }
    if ((q !== null && q < 0) || (r !== null && r < 0) || (a !== null && a < 0)) {
      out.push({ code: "NEGATIVE", title: `Line ${li.slNo ?? i + 1}: negative value`, severity: "Medium", detail: `Negative qty/rate/amount in "${(li.description ?? "").slice(0, 60)}".` });
    }
  });

  // 2) Sub-total = Σ line amounts.
  const lineSum = items.reduce((s, li) => s + (num(li.amount) ?? 0), 0);
  const sub = num(bill.subTotal);
  if (sub !== null && items.some((li) => num(li.amount) !== null) && mismatch(sub, lineSum, tolPct, tolAbs)) {
    out.push({ code: "ARITH_SUBTOTAL", title: "Sub-total ≠ sum of line items", severity: "High", detail: `Line items sum to ${money(lineSum)} but the bill shows ${money(sub)}.`, expected: money(lineSum), actual: money(sub) });
  }

  // 3) Grand (gross) total = sub-total + taxes. Recoveries reduce NET payable, not gross.
  const base = sub ?? lineSum;
  const taxSum = (bill.taxes ?? []).reduce((s, t) => s + (num(t.amount) ?? 0), 0);
  const dedSum = (bill.deductions ?? []).reduce((s, d) => s + (num(d.amount) ?? 0), 0);
  const grand = num(bill.grandTotal);
  if (grand !== null) {
    const expected = base + taxSum;
    if (mismatch(grand, expected, tolPct, tolAbs)) {
      out.push({ code: "ARITH_TOTAL", title: "Grand total doesn't reconcile", severity: "High", detail: `Sub-total ${money(base)} + tax ${money(taxSum)} = ${money(expected)}, but the bill shows ${money(grand)}.`, expected: money(expected), actual: money(grand) });
    }
  }

  // 3b) Net payable = grand total − recoveries/deductions.
  const net = num(bill.netPayable);
  if (net !== null && grand !== null) {
    const expectedNet = grand - dedSum;
    if (mismatch(net, expectedNet, tolPct, tolAbs)) {
      out.push({ code: "ARITH_NET", title: "Net payable doesn't reconcile", severity: "High", detail: `Grand total ${money(grand)} − recoveries ${money(dedSum)} = ${money(expectedNet)}, but the bill shows net ${money(net)}.`, expected: money(expectedNet), actual: money(net) });
    }
  }

  // 4) Tax percentage recompute.
  (bill.taxes ?? []).forEach((t) => {
    const pct = num(t.pct), amt = num(t.amount);
    if (pct !== null && amt !== null && base > 0) {
      const expected = (base * pct) / 100;
      if (mismatch(amt, expected, tolPct, Math.max(tolAbs, 1))) {
        out.push({ code: "TAX_CALC", title: `${t.name || "Tax"} (${pct}%) miscalculated`, severity: "Medium", detail: `${pct}% of ${money(base)} is ${money(expected)}, but the bill shows ${money(amt)}.`, expected: money(expected), actual: money(amt) });
      }
    }
  });

  // 5) Missing statutory recoveries.
  const recoveryText = [
    ...(bill.recoveriesPresent ?? []),
    ...(bill.deductions ?? []).map((d) => d.name ?? ""),
  ].join(" | ").toLowerCase();
  for (const rec of expectedRecoveries) {
    if (!recoveryText.includes(rec.toLowerCase())) {
      out.push({ code: "REC_MISSING", title: `No ${rec} recovery/deduction shown`, severity: "Medium", detail: `The bill shows no deduction or recovery for "${rec}". Verify whether it was due and recovered.` });
    }
  }

  // 6) Excess over sanction.
  const sanction = num(bill.sanctionedAmount);
  if (sanction !== null && grand !== null && grand > sanction * 1.005) {
    out.push({ code: "EXCESS_SANCTION", title: "Billed amount exceeds sanction", severity: "High", detail: `Grand total ${money(grand)} exceeds the sanctioned ${money(sanction)} (excess without a revised estimate is irregular).`, expected: `≤ ${money(sanction)}`, actual: money(grand) });
  }

  // 7) Suspiciously round grand total.
  if (grand !== null && grand >= 100_000 && grand % 100_000 === 0) {
    out.push({ code: "ROUND_NUMBER", title: "Grand total is an exact round figure", severity: "Low", detail: `${money(grand)} is an exact multiple of ₹1,00,000 — genuine measured bills rarely are. Worth a closer look.` });
  }

  // 8) Just below an approval threshold (possible splitting).
  if (grand !== null) {
    for (const th of APPROVAL_THRESHOLDS) {
      if (grand <= th && grand >= th * 0.97) {
        out.push({ code: "THRESHOLD", title: "Total sits just below an approval limit", severity: "Medium", detail: `${money(grand)} is within 3% below ${money(th)} — a common pattern when a work is split to stay under a sanction/tender ceiling.` });
        break;
      }
    }
  }

  return out;
}

const SEV_WEIGHT: Record<Severity, number> = { High: 10, Medium: 4, Low: 1 };

export function scoreFindings(findings: BillFinding[]): { score: number; redFlagCount: number } {
  const score = findings.reduce((s, f) => s + SEV_WEIGHT[f.severity], 0);
  const redFlagCount = findings.filter((f) => f.severity !== "Low").length;
  return { score, redFlagCount };
}
