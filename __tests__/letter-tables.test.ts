import { describe, it, expect } from "vitest";
import { buildQuantityTable, buildMismatchMatrix, buildDocumentsDemandedTable, buildSummaryBox, buildRiskTable } from "../lib/letters/tables";
import { buildEvidenceIndex, evidenceIndexToCsv } from "../lib/letters/evidence-index";
import type { LetterFinding, QuantityRow } from "../lib/letters/types";

const findings: LetterFinding[] = [
  { code: "QT-OVERRUN", title: "Quantity overrun", severity: "High", docRef: "Annexure A-1, page 12, item 5", observation: "302% of tender", mismatch: "No modified Schedule-B", suspicionReason: "Excess without sanction", recordDemand: "Modified Schedule-B", evidenceGrade: "E", riskScore: 70 },
  { code: "RATE-ABOVE-SR", title: "Rate above SR", severity: "Medium", docRef: "Annexure A-2, item 7", observation: "₹620 vs SR ₹500", recordDemand: "Rate analysis", evidenceGrade: "C", riskScore: 35 },
  { code: "NOTE", title: "Minor note", severity: "Low", observation: "rounding", riskScore: 4 },
];

describe("table builders", () => {
  it("flags quantity rows over the 125% cap", () => {
    const rows: QuantityRow[] = [
      { item: "5", description: "WMM", originalQty: "470", modifiedQty: "1420", cumulativeQty: "1420", pctOfTender: 302 },
      { item: "6", description: "GSB", originalQty: "100", modifiedQty: "110", cumulativeQty: "110", pctOfTender: 110 },
    ];
    const t = buildQuantityTable(rows);
    expect(t.rows[0]!.at(-1)).toContain("⚠");
    expect(t.rows[1]!.at(-1)).not.toContain("⚠");
  });

  it("mismatch matrix only includes findings with mismatch text", () => {
    const t = buildMismatchMatrix(findings);
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0]![0]).toBe("QT-OVERRUN");
  });

  it("documents-demanded dedupes and numbers", () => {
    const t = buildDocumentsDemandedTable([...findings, findings[0]!]);
    expect(t.rows).toHaveLength(2); // QT + RATE, duplicate dropped
    expect(t.rows[0]![0]).toBe("1");
  });

  it("summary box drops Low-severity findings", () => {
    const box = buildSummaryBox(findings);
    expect(box).toHaveLength(2);
    expect(box.every((r) => r.ground !== "Minor note")).toBe(true);
  });

  it("risk table sorts by score desc", () => {
    const t = buildRiskTable(findings);
    expect(t.rows[0]![0]).toBe("QT-OVERRUN");
  });

  it("evidence index is annexure-numbered and CSV-serialises", () => {
    const idx = buildEvidenceIndex(findings);
    expect(idx).toHaveLength(2); // both citable; Low note has no docRef/grade
    expect(idx[0]!.annexure).toBe("A-1");
    const csv = evidenceIndexToCsv(idx);
    expect(csv.split("\r\n")).toHaveLength(3); // header + 2 rows
    expect(csv).toContain("Annexure,Document");
  });
});
