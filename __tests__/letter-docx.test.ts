import { describe, it, expect } from "vitest";
import { buildLetterDocx } from "../lib/docx/bill-stop-builder";
import { buildQuantityTable } from "../lib/letters/tables";
import { assembleSkeleton } from "../lib/letters/letter-skeleton";
import type { LetterContext, LetterFinding, QuantityRow } from "../lib/letters/types";

const findings: LetterFinding[] = [
  { code: "QT-OVERRUN", title: "Quantity overrun", severity: "High", docRef: "Annexure A-1, page 12, item 5", observation: "302% of tender", mismatch: "No modified Schedule-B", suspicionReason: "Excess without sanction", workedExample: "470 × 1.25 = 587.5 allowed", ruleBasis: "PWD Code", recordDemand: "Modified Schedule-B", responsibleOfficer: "AE", evidenceGrade: "E", riskScore: 70 },
];
const ctx: LetterContext = {
  jobCode: "222-12-345678", variant: "bill_stop", language: "Kannada", signatoryKey: "raghav_gowda", findings,
};
const quantities: QuantityRow[] = [
  { item: "5", description: "WMM", originalQty: "470", modifiedQty: "1420", cumulativeQty: "1420", pctOfTender: 302 },
];

describe("DOCX builder", () => {
  it("emits a valid .docx (ZIP) buffer with a quantity chart", async () => {
    const sk = assembleSkeleton(ctx);
    const buf = await buildLetterDocx(sk, { quantityTable: buildQuantityTable(quantities) });
    expect(buf.length).toBeGreaterThan(1500);
    // OOXML files are ZIP archives → magic bytes "PK".
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });
});
