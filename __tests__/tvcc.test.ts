import { describe, it, expect } from "vitest";
import { buildTvccCompliance } from "../lib/compliance/tvcc";
import type { Observation, ScheduleBTables } from "../lib/intelligence/types";

const SB: ScheduleBTables = {
  groups: [{ category: "excavation", title: "Excavation (earthwork)", totalLabel: "TOTAL", rows: [{ item: "2", description: "Earth work excavation", qty: "100", unit: "Cum", rate: "200", amount: "20,000" }], totalQty: "100", totalUnit: "Cum", totalAmount: "20,000" }],
};

describe("buildTvccCompliance", () => {
  it("returns null for a non-works case with no TVCC reports", () => {
    expect(buildTvccCompliance({ reports: [], scheduleBTables: null, runningBills: [], findings: [], isWorksCase: false })).toBeNull();
  });

  it("reports not_shown for a works case with no TVCC report, listing all types absent", () => {
    const t = buildTvccCompliance({ reports: [], scheduleBTables: SB, runningBills: [], findings: [], isWorksCase: true })!;
    expect(t.status).toBe("not_shown");
    expect(t.reportsFound).toHaveLength(0);
    expect(t.coverage.every((c) => !c.present)).toBe(true);
    expect(t.note).toMatch(/no tvcc/i);
  });

  it("classifies transcribed reports and marks their coverage present", () => {
    const t = buildTvccCompliance({
      reports: [
        { reportType: "Quality Inspection Report", reference: "TVCC/Q/12", date: "01-03-2026" },
        { reportType: "Site inspection", reference: "TVCC/S/4" },
      ],
      scheduleBTables: SB,
      runningBills: [{ billNo: "1", thisBill: 100000 }],
      findings: [],
      isWorksCase: true,
    })!;
    expect(t.reportsFound.map((r) => r.reportType)).toEqual(expect.arrayContaining(["quality", "site"]));
    expect(t.coverage.find((c) => /Quality/.test(c.type))?.present).toBe(true);
    expect(t.coverage.find((c) => /Site/.test(c.type))?.present).toBe(true);
    // some reports present, no conflict, but not all six types -> unknown (partial),
    // NOT discrepancy (a partial-but-clean set must not be scored worse than none).
    expect(t.status).toBe("unknown");
    expect(t.crossChecks.length).toBeGreaterThan(0);
  });

  it("flags a discrepancy when the audit already has quality findings", () => {
    const qualityFinding = { category: "MB_INTEGRITY", statement: "MB quality entries missing", severity: "High", evidenceIds: [] } as unknown as Observation;
    const t = buildTvccCompliance({
      reports: [{ reportType: "inspection", reference: "TVCC/1" }],
      scheduleBTables: SB,
      runningBills: [],
      findings: [qualityFinding],
      isWorksCase: true,
    })!;
    const qc = t.crossChecks.find((c) => /quality/i.test(c.against));
    expect(qc?.status).toBe("discrepancy");
    expect(t.status).toBe("discrepancy");
  });

  it("cell text carries no en/em dashes or pipes", () => {
    const t = buildTvccCompliance({ reports: [{ reportType: "inspection", reference: "A—B|C", observation: "x–y" }], scheduleBTables: null, runningBills: [], findings: [], isWorksCase: true })!;
    for (const r of t.reportsFound) {
      for (const v of [r.reference, r.observation]) {
        if (v) {
          expect(v).not.toMatch(/[–—―]/);
          expect(v).not.toContain("|");
        }
      }
    }
  });
});
