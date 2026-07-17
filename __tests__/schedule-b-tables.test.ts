import { describe, it, expect } from "vitest";
import { buildScheduleBTables } from "../lib/intelligence/schedule-b-tables";
import type { ScheduleBLineItem } from "../lib/ai/extractors/document-facts";

// The three excavation + four dismantling/milling items from the reference
// Lokayukta complaint (Job Code 209-26-000007), with amounts as printed.
const EXCAVATION: ScheduleBLineItem[] = [
  { item: "Item 2", description: "Earth work excavation by manual means for drains, canals, in all kinds of soils, depth upto 1.5 m", qty: "9,763.25", unit: "Cum", rate: "276.82", amount: "27,02,662.86" },
  { item: "Item 3", description: "Earth work excavation for Foundation by mechanical means for all works & depth upto 3 m", qty: "318.05", unit: "Cum", rate: "116.68", amount: "37,110.07" },
  { item: "Item 26", description: "Earth work in surface excavation by mechanical means for lowering & levelling the ground", qty: "7,463.62", unit: "Cum", rate: "108.67", amount: "8,11,071.59" },
];
const DISMANTLING: ScheduleBLineItem[] = [
  { item: "Item 4", description: "Dismantling of existing structures like culverts, bridges, Cement Concrete Grade M-15 & M-20", qty: "190.89", unit: "Cum", rate: "822.46", amount: "1,56,999.39" },
  { item: "Item 5", description: "Dismantling of kerb stone by manual means and disposal of dismantled material", qty: "8,333.00", unit: "Mtr", rate: "25.17", amount: "2,09,741.61" },
  { item: "Item 24", description: "Dismantling of Flexible pavements and disposal of dismantled materials, Bituminous course", qty: "1,148.76", unit: "Cum", rate: "368.33", amount: "4,23,122.77" },
  { item: "Item 25", description: "Milling of existing Bituminous surface to a specified depth up to 40mm using Milling machine", qty: "1,03,098.90", unit: "Sqm", rate: "51.48", amount: "53,07,531.37" },
];

describe("buildScheduleBTables", () => {
  it("returns null when there are no items or none are usable", () => {
    expect(buildScheduleBTables([])).toBeNull();
    // Missing rate -> dropped -> no groups -> null.
    expect(buildScheduleBTables([{ description: "Earth work excavation", qty: "100", unit: "Cum" }])).toBeNull();
    // Uncategorised item (asphalting) -> not excavation/dismantling/milling -> null.
    expect(buildScheduleBTables([{ description: "Providing and laying Wet Mix Macadam", qty: "500", unit: "Cum", rate: "1200" }])).toBeNull();
  });

  it("builds the excavation group with a summed qty (uniform unit) and summed amount", () => {
    const t = buildScheduleBTables(EXCAVATION)!;
    expect(t.groups).toHaveLength(1);
    const g = t.groups[0]!;
    expect(g.category).toBe("excavation");
    expect(g.rows).toHaveLength(3);
    // 9,763.25 + 318.05 + 7,463.62 = 17,544.92 (all Cum)
    expect(g.totalQty).toBe("17,544.92");
    expect(g.totalUnit).toBe("Cum");
    // 27,02,662.86 + 37,110.07 + 8,11,071.59 = 35,50,844.52
    expect(g.totalAmount).toBe("35,50,844.52");
    expect(g.totalLabel).toMatch(/TOTAL EXCAVATION/i);
  });

  it("builds the dismantling/milling group with NO qty total when units are mixed", () => {
    const t = buildScheduleBTables(DISMANTLING)!;
    const g = t.groups[0]!;
    expect(g.category).toBe("dismantling_milling");
    expect(g.rows).toHaveLength(4);
    // Cum + Mtr + Sqm -> mixed -> no summable quantity
    expect(g.totalQty).toBeNull();
    expect(g.totalUnit).toBeNull();
    // 1,56,999.39 + 2,09,741.61 + 4,23,122.77 + 53,07,531.37 = 60,97,395.14
    expect(g.totalAmount).toBe("60,97,395.14");
  });

  it("keeps both groups in order (excavation first) when both are present", () => {
    const t = buildScheduleBTables([...DISMANTLING, ...EXCAVATION])!;
    expect(t.groups.map((g) => g.category)).toEqual(["excavation", "dismantling_milling"]);
  });

  it("computes amount = qty x rate when the amount is not printed", () => {
    const t = buildScheduleBTables([{ item: "Item 3", description: "Earth work excavation for Foundation", qty: "318.05", unit: "Cum", rate: "116.68" }])!;
    const row = t.groups[0]!.rows[0]!;
    // 318.05 * 116.68 = 37,110.074 -> 37,110.07
    expect(row.amount).toBe("37,110.07");
  });

  it("drops a row missing qty or rate but keeps the valid ones", () => {
    const t = buildScheduleBTables([
      EXCAVATION[0]!,
      { item: "Item X", description: "Earth work excavation garbled", unit: "Cum" }, // no qty/rate -> dropped
    ])!;
    expect(t.groups[0]!.rows).toHaveLength(1);
    expect(t.groups[0]!.rows[0]!.item).toBe("Item 2");
  });

  it("prefers the verbatim printed figures for cells and fills '-' for a missing item/unit", () => {
    const t = buildScheduleBTables([{ description: "Milling of existing bituminous surface", qty: "1,03,098.90", rate: "51.48", amount: "53,07,531.37" }])!;
    const row = t.groups[0]!.rows[0]!;
    expect(row.item).toBe("-");
    expect(row.unit).toBe("-");
    expect(row.qty).toBe("1,03,098.90"); // verbatim, not reformatted
    expect(row.amount).toBe("53,07,531.37");
  });

  it("carries the verification note", () => {
    const t = buildScheduleBTables(EXCAVATION)!;
    expect(t.note).toMatch(/verification against the certified/i);
  });

  it("nets a negative / deduct row into the totals so the TOTAL matches the rows", () => {
    const t = buildScheduleBTables([
      { item: "1", description: "Earthwork excavation in ordinary soil", qty: "10,000", unit: "Cum", rate: "200", amount: "20,00,000" },
      { item: "2", description: "Deduct: earthwork excavation not executed", qty: "-2,000", unit: "Cum", rate: "200", amount: "-4,00,000" },
    ])!;
    const g = t.groups[0]!;
    // 20,00,000 + (-4,00,000) = 16,00,000 ; 10,000 + (-2,000) = 8,000 Cum
    expect(g.totalAmount).toBe("16,00,000");
    expect(g.totalQty).toBe("8,000");
    // the deduct row still prints its verbatim negative figures
    expect(g.rows[1]!.amount).toBe("-4,00,000");
  });

  it("classifies a composite 'dismantling ... including excavation' line as dismantling, not excavation", () => {
    const t = buildScheduleBTables([
      { item: "5", description: "Dismantling of existing cement concrete pavement including excavation and stacking", qty: "1,200", unit: "Cum", rate: "150", amount: "1,80,000" },
    ])!;
    expect(t.groups[0]!.category).toBe("dismantling_milling");
  });

  it("tolerates non-string field values (model may emit JSON numbers) without throwing", () => {
    const t = buildScheduleBTables([
      // qty/rate/amount/item emitted as numbers, not strings
      { item: 2 as unknown as string, description: "Earthwork excavation in ordinary soil", qty: 9763.25 as unknown as string, unit: "Cum", rate: 276.82 as unknown as string, amount: 2702662.86 as unknown as string },
    ])!;
    const row = t.groups[0]!.rows[0]!;
    expect(row.item).toBe("2");
    expect(row.qty).toBe("9763.25");
    expect(t.groups[0]!.category).toBe("excavation");
  });

  it("normalizes en/em dashes and pipes inside a transcribed cell", () => {
    const t = buildScheduleBTables([
      { item: "4", description: "Dismantling of M–15 | M–20 cement concrete", qty: "190.89", unit: "Cum", rate: "822.46", amount: "1,56,999.39" },
    ])!;
    const desc = t.groups[0]!.rows[0]!.description;
    expect(desc).not.toMatch(/[–—―]/);
    expect(desc).not.toContain("|");
    expect(desc).toContain("M-15"); // en-dash -> hyphen
  });

  it("collapses a byte-identical repeated row", () => {
    const dup = { item: "2", description: "Earthwork excavation in ordinary soil", qty: "9,763.25", unit: "Cum", rate: "276.82", amount: "27,02,662.86" };
    const t = buildScheduleBTables([dup, { ...dup }])!;
    expect(t.groups[0]!.rows).toHaveLength(1);
  });

  it("emits no en/em dashes and no pipe chars in any cell (safe for the sanitizer + Markdown table)", () => {
    const t = buildScheduleBTables([...EXCAVATION, ...DISMANTLING])!;
    for (const g of t.groups) {
      for (const r of g.rows) {
        for (const cell of [r.item, r.description, r.qty, r.unit, r.rate, r.amount]) {
          expect(cell).not.toContain("|");
          expect(cell).not.toMatch(/[–—―]/);
        }
      }
    }
  });
});
