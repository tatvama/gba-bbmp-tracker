/**
 * Schedule-of-Rates (SR) / approved-tender rate checking (PURE, testable).
 * Matches billed line items to a rate book and flags rates above the approved
 * rate, plus non-schedule ("star-rate") items with no SR match.
 */
import type { BillFinding, BillLineItem } from "./types";

export interface SrRate {
  srCode: string | null;
  description: string;
  unit: string | null;
  rate: number;
  srYear?: string | null;
}

const STOP = new Set(["the", "of", "and", "for", "with", "in", "to", "a", "as", "per", "mm", "cm"]);

function tokens(s: string): Set<string> {
  return new Set(
    (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

/** Jaccard token overlap of two descriptions (0..1). */
function similarity(a: string, b: string): number {
  const ta = tokens(a), tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/** Best SR match for a line item — by exact code first, else fuzzy description. */
export function matchSrRate(
  li: BillLineItem,
  book: SrRate[],
  minSim = 0.4,
): { rate: SrRate; sim: number } | null {
  if (li.srCode) {
    const byCode = book.find((r) => r.srCode && r.srCode.toLowerCase() === li.srCode!.toLowerCase());
    if (byCode) return { rate: byCode, sim: 1 };
  }
  let best: { rate: SrRate; sim: number } | null = null;
  for (const r of book) {
    const sim = similarity(li.description, r.description);
    if (sim >= minSim && (!best || sim > best.sim)) best = { rate: r, sim };
  }
  return best;
}

const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** Flag billed rates above the matched SR rate (tolerance %). */
export function checkRates(
  lineItems: BillLineItem[],
  book: SrRate[],
  opts: { tolerancePct?: number } = {},
): BillFinding[] {
  if (!book.length) return [];
  const tol = opts.tolerancePct ?? 5;
  const out: BillFinding[] = [];
  lineItems.forEach((li, i) => {
    if (typeof li.rate !== "number" || !Number.isFinite(li.rate)) return;
    const m = matchSrRate(li, book);
    if (!m) {
      out.push({
        code: "RATE_NO_SR",
        title: `Line ${li.slNo ?? i + 1}: no Schedule-of-Rates match`,
        severity: "Low",
        detail: `"${(li.description ?? "").slice(0, 60)}" has no SR/tender match — verify it isn't a non-schedule "star rate" item billed without rate analysis.`,
      });
      return;
    }
    const over = ((li.rate - m.rate.rate) / m.rate.rate) * 100;
    if (over > tol) {
      out.push({
        code: "RATE_ABOVE_SR",
        title: `Line ${li.slNo ?? i + 1}: rate ${over.toFixed(0)}% above SR`,
        severity: over > 25 ? "High" : "Medium",
        detail: `"${(li.description ?? "").slice(0, 60)}" billed at ${money(li.rate)} vs SR ${money(m.rate.rate)}${m.rate.srYear ? ` (${m.rate.srYear})` : ""}${m.sim < 1 ? " [fuzzy match — verify]" : ""}.`,
        expected: `≤ ${money(m.rate.rate * (1 + tol / 100))}`,
        actual: money(li.rate),
      });
    }
  });
  return out;
}
