import { describe, it, expect } from "vitest";
import { mapBillFindingToLetter } from "../lib/letters/from-findings";
import type { BillFinding } from "../lib/forensics/types";

describe("mapBillFindingToLetter", () => {
  it("carries the figures and derives a rule basis from the code prefix", () => {
    const f: BillFinding = {
      code: "QT-OVERRUN", title: "Quantity overrun", severity: "High",
      detail: "302% of tender", findingClass: "confirmed_mismatch",
      expected: "<=125%", actual: "302%", workedExample: "470 x 1.25 = 587.5",
      recordToDemand: "Modified Schedule-B", evidenceGrade: "E", riskPoints: 70,
    };
    const lf = mapBillFindingToLetter(f);
    expect(lf.code).toBe("QT-OVERRUN");
    expect(lf.observation).toBe("302% of tender");
    expect(lf.workedExample).toBe("470 x 1.25 = 587.5");
    expect(lf.recordDemand).toBe("Modified Schedule-B");
    expect(lf.evidenceGrade).toBe("E");
    expect(lf.riskScore).toBe(70);
    expect(lf.mismatch).toMatch(/302%/); // expected/actual folded into mismatch text
    expect(lf.ruleBasis).toMatch(/PWD Code|Schedule-B|variation/i); // from STATUTE_MAP[QT]
  });

  it("prefers an explicit ruleRef and safeText when present", () => {
    const f: BillFinding = {
      code: "MB-FORM-blank_signed", title: "Blank signed form", severity: "Medium",
      detail: "blank fields", ruleRef: "MB rules X", safeText: "requires the original record",
      findingClass: "possible_forgery_redflag",
    };
    const lf = mapBillFindingToLetter(f);
    expect(lf.ruleBasis).toBe("MB rules X");
    expect(lf.suspicionReason).toBe("requires the original record");
  });

  it("synthesises a doc ref from sourceDocId and falls back on recordDemand", () => {
    const f: BillFinding = { code: "PHOTO-DUP", title: "Duplicate photo", severity: "High", detail: "dup", sourceDocId: "abcd1234efgh" };
    const lf = mapBillFindingToLetter(f);
    expect(lf.docRef).toContain("abcd1234"); // first 8 of the id
    expect(lf.recordDemand).toBeTruthy(); // fallback record-to-demand
  });

  it("missing_proof class produces a 'record not found' mismatch line", () => {
    const f: BillFinding = { code: "DD-CESS-MISSING", title: "No cess", severity: "Medium", detail: "no cess shown", findingClass: "missing_proof" };
    const lf = mapBillFindingToLetter(f);
    expect(lf.mismatch).toMatch(/not found|mandatory/i);
  });
});
