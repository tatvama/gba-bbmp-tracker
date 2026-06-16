import { describe, it, expect } from "vitest";
import { runJobAudit } from "../lib/forensics/job-audit";

describe("runJobAudit (golden, multi-signal)", () => {
  const report = runJobAudit({
    jobNumber: "174-24-000001",
    bills: [{
      lineItems: [{ description: "WMM", qty: 1420, rate: 50, amount: 71000 }],
      taxes: [{ name: "GST", pct: 18, amount: 12780 }],
      deductions: [{ name: "Income Tax (TDS)", amount: 838 }],
      subTotal: 71000, grandTotal: 83780, sanctionedAmount: 50000,
    }],
    scheduleB: [{ itemCode: "5", description: "Wet Mix Macadam", tenderQty: 470, cumulativeQty: 1420, rate: 50 }],
    runningBills: [
      { itemCode: "5", billNo: "1", billDate: "2024-01-01", totalUptoDate: 700 },
      { itemCode: "5", billNo: "2", billDate: "2024-02-01", previousMeasurement: 900, totalUptoDate: 1420 },
    ],
    timeline: { work_order: "2024-02-01", agreement: "2024-01-15", commencement: "2024-02-10" },
    insurance: { policies: [], ctx: { commencement: "2024-02-10", completion: "2024-04-10" } },
    royalty: [{ billedMaterialQty: 1420, royaltyPaidQty: 700, royaltyRate: 70, material: "WMM" }],
    documentsForMatrix: [{ docType: "Bill copy", present: true }, { docType: "Insurance policy", present: false }],
  });

  it("flags the quantity overrun (>300%, hidden item → grade E)", () => {
    const ov = report.findings.find((f) => f.code === "QT-OVERRUN");
    expect(ov).toBeTruthy();
    expect(ov!.evidenceGrade).toBe("E");
  });

  it("flags excess over sanction, carry-forward break, chronology, missing insurance, royalty short", () => {
    const codes = report.findings.map((f) => f.code);
    expect(codes).toContain("EXCESS_SANCTION");
    expect(codes).toContain("MB-02");
    expect(codes).toContain("CH-08"); // agreement before work order
    expect(codes).toContain("IN-06"); // required insurance missing
    expect(codes).toContain("RY-02"); // royalty short
  });

  it("computes a risk score/band and loss exposure", () => {
    expect(report.risk.score).toBeGreaterThan(50);
    expect(["serious", "bill_stop"]).toContain(report.risk.band);
    expect(report.loss.totalPossibleExposure).toBeGreaterThan(0); // royalty short × rate
  });

  it("every finding is enriched + rankedFindings is sorted by risk", () => {
    expect(report.findings.every((f) => f.category && f.evidenceGrade && f.riskPoints != null)).toBe(true);
    const pts = report.rankedFindings.map((f) => f.riskPoints ?? 0);
    expect(pts).toEqual([...pts].sort((a, b) => b - a));
  });
});
