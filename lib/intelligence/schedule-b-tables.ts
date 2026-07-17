/**
 * Deterministic Schedule-B quantity-table builder (PURE, no I/O, framework-free —
 * unit-tested like lib/intelligence/insurance-coverage.ts).
 *
 * Takes the earthwork-excavation / dismantling / milling line items TRANSCRIBED
 * from ONE case document (lib/ai/extractors/document-facts.ts, temp-0 strict
 * transcription — never invented) and shapes them into the two Schedule-B tables
 * the reference Lokayukta complaint uses: an Excavation table and a Dismantling /
 * Milling table, each with Item | Description | Qty | Unit | Rate | Amount and a
 * per-group TOTAL row. These are the un-reverifiable earthwork/disposal items
 * that matter for accountability once the material has left the site.
 *
 * The drafter reproduces these tables verbatim; the amount is computed (qty ×
 * rate) only when not printed, and any row missing a quantity or rate is dropped
 * so no half-transcribed row reaches the letter. Figures are as-transcribed and
 * the note tells the reader to verify them against the certified Schedule-B / MB.
 */
import { groupIndian } from "@/lib/format-inr";
import { parseRupees } from "./insurance-coverage";
import type { ScheduleBLineItem } from "@/lib/ai/extractors/document-facts";
import type { ScheduleBTables, ScheduleBGroup, ScheduleBRow } from "./types";

const EXCAVATION_RE = /\b(earth\s*work|earthwork|excavat)/i;
const DISMANTLE_MILL_RE = /\b(dismantl|milling|scarif)/i;

/** Coerce a transcribed field to a trimmed, table-safe string. The model may emit
 *  a JSON number rather than a string, so we never assume `.trim()` is available.
 *  A literal pipe would break the Markdown table and en/em/bar dashes would be
 *  rewritten by the safe-language sanitizer, so both are normalized to ASCII —
 *  the figure/description then renders verbatim and stable in the letter. */
function cell(v: unknown): string {
  return (v == null ? "" : String(v)).trim().replace(/[–—―]/g, "-").replace(/\|/g, "/");
}

/** Parse a possibly-signed rupee / quantity value. parseRupees anchors on the
 *  first digit and so ignores a leading "-" or "(" — a deduct/negative bill row
 *  would then sum as POSITIVE and make a TOTAL contradict the rows above it. We
 *  recover the sign here so group totals net deduct rows correctly. */
function parseSigned(v: unknown): number | null {
  const str = (v == null ? "" : String(v)).trim();
  if (!str) return null;
  const mag = parseRupees(str);
  if (mag == null) return null;
  const negative = /^[-(]/.test(str) || /^\(.*\)$/.test(str);
  return negative ? -mag : mag;
}

/** "27,02,662.86" — Indian grouping, keeping up to 2 decimals when present. */
function fmt(n: number): string {
  const neg = n < 0;
  const a = Math.abs(n);
  const whole = Math.floor(a);
  const paise = Math.round((a - whole) * 100);
  // Rounding paise can carry into the rupee (e.g. x.999 -> .00 + 1 rupee).
  const carried = paise === 100 ? { w: whole + 1, p: 0 } : { w: whole, p: paise };
  const base = groupIndian(carried.w);
  const s = carried.p > 0 ? `${base}.${String(carried.p).padStart(2, "0")}` : base;
  return neg ? `-${s}` : s;
}

const norm = (s: unknown) => cell(s).toLowerCase().replace(/[.\s]+$/, "");

interface Parsed {
  category: ScheduleBGroup["category"];
  qtyNum: number;
  amtNum: number;
  unitNorm: string;
  unitRaw: string;
  row: ScheduleBRow;
}

function parseItem(it: ScheduleBLineItem): Parsed | null {
  const description = cell(it?.description);
  const qtyNum = parseSigned(it?.qty);
  const rateNum = parseSigned(it?.rate);
  // A usable row needs a description AND a quantity AND a rate — otherwise the
  // 6-column table row would be half-empty / half-invented, so drop it.
  if (!description || qtyNum == null || rateNum == null) return null;

  // Dismantling / milling is tested BEFORE excavation: a composite line such as
  // "Dismantling of pavement including excavation" is primarily dismantling and
  // must not be pulled into the excavation group by the incidental "excavation".
  const category: ScheduleBGroup["category"] | null = DISMANTLE_MILL_RE.test(description)
    ? "dismantling_milling"
    : EXCAVATION_RE.test(description)
      ? "excavation"
      : null;
  if (!category) return null;

  const amtNum = parseSigned(it?.amount) ?? qtyNum * rateNum;
  const unitRaw = cell(it?.unit);
  return {
    category,
    qtyNum,
    amtNum,
    unitNorm: norm(it?.unit),
    unitRaw,
    row: {
      item: cell(it?.item) || "-",
      description,
      qty: cell(it?.qty) || fmt(qtyNum),
      unit: unitRaw || "-",
      rate: cell(it?.rate) || fmt(rateNum),
      amount: cell(it?.amount) || fmt(amtNum),
    },
  };
}

const GROUP_META: { category: ScheduleBGroup["category"]; title: string; totalLabel: string }[] = [
  { category: "excavation", title: "Excavation (earthwork)", totalLabel: "TOTAL EXCAVATION SANCTIONED" },
  { category: "dismantling_milling", title: "Dismantling / Milling", totalLabel: "TOTAL DISMANTLING / MILLING ITEMS" },
];

/**
 * Build the Schedule-B excavation + dismantling/milling tables from transcribed
 * line items. Returns null when no usable earthwork/dismantling/milling row was
 * found (nothing to tabulate). Identical rows (same item + description + figures)
 * are collapsed defensively so a document that repeats a line is tabled once.
 */
export function buildScheduleBTables(items: ScheduleBLineItem[]): ScheduleBTables | null {
  const seen = new Set<string>();
  const parsed = (items ?? [])
    .map(parseItem)
    .filter((p): p is Parsed => p !== null)
    .filter((p) => {
      const key = [p.row.item, norm(p.row.description), p.row.qty, p.row.rate, p.row.amount].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (!parsed.length) return null;

  const groups: ScheduleBGroup[] = [];
  for (const meta of GROUP_META) {
    const inGroup = parsed.filter((p) => p.category === meta.category);
    if (!inGroup.length) continue;

    const totalAmount = inGroup.reduce((s, p) => s + p.amtNum, 0);
    // A summed quantity only makes sense when every row shares one unit
    // (e.g. all Cum); mixed units (Cum + Mtr + Sqm) get a blank qty total.
    const units = new Set(inGroup.map((p) => p.unitNorm).filter(Boolean));
    const uniform = units.size === 1 && inGroup.every((p) => p.unitNorm);
    const totalQty = uniform ? inGroup.reduce((s, p) => s + p.qtyNum, 0) : null;

    groups.push({
      category: meta.category,
      title: meta.title,
      totalLabel: meta.totalLabel,
      rows: inGroup.map((p) => p.row),
      totalQty: totalQty != null ? fmt(totalQty) : null,
      totalUnit: uniform ? inGroup[0]!.unitRaw || null : null,
      totalAmount: fmt(totalAmount),
    });
  }
  if (!groups.length) return null;

  return {
    groups,
    note: "These quantities, rates and amounts are transcribed from the Schedule-B as supplied and require verification against the certified original Schedule-B and the Measurement Book. Excavated, dismantled and milled material, once removed from site, leaves nothing to re-measure, so these items must be checked against contemporaneous records (lead chart, trip-sheets, weighbridge slips, MAS register) before the corresponding bills are certified.",
  };
}
