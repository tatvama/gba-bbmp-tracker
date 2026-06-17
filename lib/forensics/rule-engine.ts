/**
 * Deterministic bill-audit rule engine (PURE, framework-free, unit-tested).
 * Recomputes arithmetic exactly and applies fixed forensic rules to a structured
 * bill. No AI, no hallucination — every finding states the expected vs actual
 * number and the rule it broke. Findings are indicators for human verification.
 */
import type { BillFinding, StructuredBill, Severity, ScheduleBItem } from "./types";
import {
  IT_TDS_PCT, GST_TDS_PCT, GST_TDS_MIN_CONTRACT, BOCW_CESS_PCT,
  QTY_PER_ITEM_QUOTED_CAP_PCT, CONTRACT_OVERALL_CAP,
} from "../constants";
import { expectedGstPct } from "./gst";
import type { SrRate } from "./rate-check";
import { matchSrRate } from "./rate-check";

const DEFAULT_EXPECTED_RECOVERIES = ["Royalty", "Income Tax", "GST", "Security Deposit"];
const HIDDEN_ITEM_RE = /\b(wmm|gsb|dbm|\bbc\b|bituminous|macadam|wet mix|granular sub|prime coat|tack coat|excavation|earthwork|pcc|rcc)\b/i;
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

  // 6) Excess over sanction (overall contract cap: 5% if > ₹10cr else 10%).
  const sanction = num(bill.sanctionedAmount);
  if (sanction !== null && grand !== null) {
    const capPct = sanction > CONTRACT_OVERALL_CAP.thresholdInr ? CONTRACT_OVERALL_CAP.aboveTenCrPct : CONTRACT_OVERALL_CAP.atOrBelowTenCrPct;
    const allowed = sanction * (1 + capPct / 100);
    if (grand > allowed) {
      out.push({ code: "EXCESS_SANCTION", title: "Billed amount exceeds sanction beyond the permissible cap", severity: "High", category: "QUANTITY", findingClass: "confirmed_mismatch", evidenceGrade: "B", detail: `Grand total ${money(grand)} exceeds the sanctioned ${money(sanction)} by more than the ${capPct}% overall cap (allowed ≤ ${money(allowed)}). Excess without a revised estimate/sanction is irregular.`, expected: `≤ ${money(allowed)}`, actual: money(grand), recordToDemand: "Revised technical sanction + competent approval" });
    }
  }

  // 7) Suspiciously round grand total.
  if (grand !== null && grand >= 100_000 && grand % 100_000 === 0) {
    out.push({ code: "ROUND_NUMBER", title: "Grand total is an exact round figure", severity: "Low", detail: `${money(grand)} is an exact multiple of ₹1,00,000 — genuine measured bills rarely are. Worth a closer look.` });
  }

  // 8) Just below an approval threshold (possible splitting). Strictly below — a
  // total exactly AT a limit is not "below" it, and excluding the exact value also
  // avoids double-flagging round figures that already triggered ROUND_NUMBER.
  if (grand !== null) {
    for (const th of APPROVAL_THRESHOLDS) {
      if (grand < th && grand >= th * 0.97) {
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

// ── Deduction math (statutory recoveries) ────────────────────────────────────

export interface DeductionContext {
  payeeType?: "individual" | "huf" | "company" | "firm" | "other" | null;
  contractValue?: number | null;
}

/** IT-TDS (payee-dependent 1%/2%) + GST-TDS (2% above ₹2.5L). Verifies, doesn't accuse. */
export function checkDeductionMath(bill: StructuredBill, ctx: DeductionContext, opts: RuleOptions = {}): BillFinding[] {
  const tolPct = opts.tolerancePct ?? 1;
  const tolAbs = opts.toleranceAbs ?? 1;
  const out: BillFinding[] = [];
  const base = num(bill.subTotal) ?? (bill.lineItems ?? []).reduce((s, li) => s + (num(li.amount) ?? 0), 0);
  const grand = num(bill.grandTotal) ?? base;
  const deds = bill.deductions ?? [];
  const find = (re: RegExp) => deds.find((d) => re.test(d.name ?? ""));

  // IT-TDS (s.194C)
  const itDed = find(/income\s*tax|\bit\b.*tds|tds.*\bit\b/i);
  if (!ctx.payeeType) {
    out.push({ code: "DD-IT-VERIFY", title: "IT-TDS rate depends on payee type — confirm", severity: "Low", category: "DEDUCTION", findingClass: "missing_proof", evidenceGrade: "C", detail: "Income-Tax TDS under s.194C is 1% for an individual/HUF and 2% for others. The payee type is not in the supplied records, so the correct rate cannot be confirmed.", recordToDemand: "Contractor PAN/constitution to fix the TDS rate" });
  } else {
    const pct = IT_TDS_PCT[ctx.payeeType];
    // s.194C TDS is on the taxable value excluding GST when GST is shown
    // separately (CBDT Circular 23/2017) — same base as GST-TDS, so the two
    // checks are consistent rather than mixing gross and taxable.
    const expected = (base * pct) / 100;
    if (itDed) {
      const amt = num(itDed.amount);
      if (amt !== null && mismatch(amt, expected, tolPct, Math.max(tolAbs, base * 0.002))) {
        out.push({ code: "DD-IT", title: `IT-TDS (${pct}%) appears miscalculated`, severity: "Medium", category: "DEDUCTION", findingClass: "calc_variance", evidenceGrade: "B", detail: `${pct}% of taxable ${money(base)} (ex-GST, per CBDT Circular 23/2017) is ${money(expected)}, but the bill deducts ${money(amt)}. If TDS was correctly taken on a different base, produce the deduction worksheet.`, expected: money(expected), actual: money(amt) });
      }
    } else {
      out.push({ code: "DD-IT-MISSING", title: "No Income-Tax TDS deduction shown", severity: "Medium", category: "DEDUCTION", findingClass: "missing_proof", evidenceGrade: "C", detail: `No IT-TDS (${pct}%) deduction is shown; expected about ${money(expected)} on taxable ${money(base)}.`, recordToDemand: "Deduction worksheet showing IT-TDS" });
    }
  }

  // BOCW / building & other construction workers welfare cess (1% of construction cost).
  const cessDed = find(/labour\s*cess|bocw|welfare\s*cess|building.*cess|construction.*cess/i);
  const cessExpected = (base * BOCW_CESS_PCT) / 100;
  if (cessDed) {
    const amt = num(cessDed.amount);
    if (amt !== null && mismatch(amt, cessExpected, tolPct, Math.max(tolAbs, base * 0.002))) {
      out.push({ code: "DD-CESS", title: `Labour welfare cess (${BOCW_CESS_PCT}%) appears miscalculated`, severity: "Medium", category: "DEDUCTION", findingClass: "calc_variance", evidenceGrade: "B", detail: `${BOCW_CESS_PCT}% of construction cost ${money(base)} is ${money(cessExpected)}, but the bill deducts ${money(amt)}. The cess base must exclude GST.`, expected: money(cessExpected), actual: money(amt) });
    }
  } else {
    out.push({ code: "DD-CESS-MISSING", title: "No labour welfare (BOCW) cess deduction shown", severity: "Medium", category: "DEDUCTION", findingClass: "missing_proof", evidenceGrade: "C", detail: `No BOCW labour-welfare cess (${BOCW_CESS_PCT}% of construction cost) is shown; it is due on building & construction works. Expected about ${money(cessExpected)} on ${money(base)}.`, recordToDemand: "Deduction worksheet / cess challan showing labour-welfare cess" });
  }

  // GST-TDS (CGST+SGST 2%) — only above ₹2.5L contract value.
  const applicable = typeof ctx.contractValue !== "number" || ctx.contractValue > GST_TDS_MIN_CONTRACT;
  const gstDed = find(/gst\s*tds|cgst|sgst|tds.*gst/i);
  if (applicable) {
    const expected = (base * GST_TDS_PCT) / 100;
    if (gstDed) {
      const amt = num(gstDed.amount);
      if (amt !== null && mismatch(amt, expected, tolPct, Math.max(tolAbs, base * 0.002))) {
        out.push({ code: "DD-GST", title: `GST-TDS (${GST_TDS_PCT}%) appears miscalculated`, severity: "Medium", category: "DEDUCTION", findingClass: "calc_variance", evidenceGrade: "B", detail: `${GST_TDS_PCT}% of taxable ${money(base)} is ${money(expected)}, but the bill deducts ${money(amt)}.`, expected: money(expected), actual: money(amt) });
      }
    } else {
      out.push({ code: "DD-GST-MISSING", title: "No GST-TDS deduction shown", severity: "Medium", category: "DEDUCTION", findingClass: "missing_proof", evidenceGrade: "C", detail: `No GST-TDS (${GST_TDS_PCT}%) deduction is shown; it applies on works-contract payments above ₹2,50,000.`, recordToDemand: "Deduction worksheet showing GST-TDS" });
    }
  }
  return out;
}

// ── Quantity overrun (125 / 200 / 300%) ──────────────────────────────────────

function isHidden(it: ScheduleBItem): boolean {
  return it.isHiddenItem === true || HIDDEN_ITEM_RE.test(it.description ?? "");
}

export function checkQuantityOverrun(items: ScheduleBItem[], _opts: { hiddenItems?: string[] } = {}): BillFinding[] {
  const out: BillFinding[] = [];
  items.forEach((it, i) => {
    const tag = it.itemCode ?? `#${i + 1}`;
    const t = num(it.tenderQty), c = num(it.cumulativeQty);
    if (t === null || t === 0) {
      if (c !== null) out.push({ code: "QT-06", title: `Tender quantity not shown (item ${tag})`, severity: "Low", category: "QUANTITY", findingClass: "missing_proof", evidenceGrade: "C", detail: `Cumulative ${c} billed but the Schedule-B tender quantity for "${(it.description ?? "").slice(0, 50)}" is not in the supplied records.`, recordToDemand: "Schedule B with tender quantity" });
      return;
    }
    if (c === null) return;
    const pct = (c / t) * 100;
    if (pct <= QTY_PER_ITEM_QUOTED_CAP_PCT) return;
    const band = pct >= 300 ? "≥300%" : pct >= 200 ? "200–299%" : "125–199%";
    const hidden = isHidden(it);
    out.push({
      code: "QT-OVERRUN",
      title: `Quantity overrun ${pct.toFixed(0)}% (item ${tag})`,
      severity: "High",
      category: "QUANTITY",
      findingClass: "confirmed_mismatch",
      evidenceGrade: hidden ? "E" : "B",
      detail: `"${(it.description ?? "").slice(0, 50)}": cumulative ${c} vs tender ${t} = ${pct.toFixed(0)}% (${band}). Beyond 125% needs a revised TS + competent approval.${hidden ? " This is a hidden/buried item — thickness/quantity cannot be re-verified after covering without core-cut/tests." : ""}`,
      expected: `≤ ${(t * 1.25).toFixed(2)} (125%)`,
      actual: `${c} (${pct.toFixed(0)}%)`,
      valueImpact: pct >= 300 ? "high" : pct >= 200 ? "medium" : "low",
      ruleRef: "KW-4 quantity variation; revised technical sanction beyond 125%",
      recordToDemand: hidden ? "Revised TS + core-cutting / Marshall / density / stage photos" : "Revised TS + competent approval + measurement basis",
    });
  });
  return out;
}

// ── Rate abuse (vs agreement rate; excess portion vs current SoR) ─────────────

export function checkRateAbuse(
  items: ScheduleBItem[],
  agreementRates: Map<string, number>,
  book: SrRate[],
  _opts: { billDate?: string | null; earthworkSharePct?: number } = {},
): BillFinding[] {
  const out: BillFinding[] = [];
  items.forEach((it, i) => {
    const r = num(it.rate ?? null);
    if (r === null) return;
    const tag = it.itemCode ?? `#${i + 1}`;
    const agr = it.itemCode ? agreementRates.get(it.itemCode) : undefined;
    if (typeof agr === "number" && r > agr * 1.01) {
      out.push({ code: "RT-01", title: `Bill rate above agreement rate (item ${tag})`, severity: "High", category: "RATE", findingClass: "confirmed_mismatch", evidenceGrade: "A", detail: `"${(it.description ?? "").slice(0, 50)}" billed at ${money(r)} vs agreement rate ${money(agr)}.`, expected: money(agr), actual: money(r), recordToDemand: "Agreement Schedule B + any approved rate revision" });
    }
    // Excess quantity beyond 125% must be priced at current SoR, not the (often higher) quoted rate.
    const t = num(it.tenderQty), c = num(it.cumulativeQty);
    if (t && c && (c / t) * 100 > QTY_PER_ITEM_QUOTED_CAP_PCT && book.length) {
      const m = matchSrRate({ description: it.description, srCode: it.itemCode ?? null, qty: null, rate: r, amount: null }, book);
      if (m && r > m.rate.rate * 1.05) {
        out.push({ code: "RT-02", title: `Excess-quantity portion priced above SoR (item ${tag})`, severity: "High", category: "RATE", findingClass: "confirmed_mismatch", evidenceGrade: "B", detail: `Quantity exceeds 125%; the excess should be paid at the current Schedule of Rates (${money(m.rate.rate)}${m.rate.srYear ? ` ${m.rate.srYear}` : ""}), but the bill applies ${money(r)}${m.sim < 1 ? " [fuzzy SoR match — verify]" : ""}.`, expected: `excess at ≤ ${money(m.rate.rate)}`, actual: money(r), recordToDemand: "Rate analysis + SoR for the excess quantity" });
      }
    }
  });
  return out;
}
