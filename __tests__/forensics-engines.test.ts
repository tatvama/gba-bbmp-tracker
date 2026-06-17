import { describe, it, expect } from "vitest";
import { scoreFinding, gradeEvidence, bandFor, scoreJobRisk } from "../lib/forensics/risk-score";
import { checkChronology, checkCompletionAndDlp } from "../lib/forensics/chronology";
import { checkEligibility } from "../lib/forensics/eligibility";
import { checkInsurance, checkSecurityFsd } from "../lib/forensics/insurance-security";
import { reconcileCarryForward, checkMbIntegrity } from "../lib/forensics/mb-integrity";
import { reconcileRoyalty } from "../lib/forensics/royalty-salvage";
import { computeLossExposure } from "../lib/forensics/loss-exposure";
import { detectRepeatPatterns, crossDocFieldMismatch } from "../lib/forensics/pattern-detector";
import { checkDeductionMath, checkQuantityOverrun, checkRateAbuse, runBillRules } from "../lib/forensics/rule-engine";
import type { BillFinding, StructuredBill } from "../lib/forensics/types";

const codes = (f: BillFinding[]) => f.map((x) => x.code);

describe("risk-score", () => {
  it("High + documentary + forgery = 95 → bill_stop", () => {
    const s = scoreFinding({ code: "x", title: "", severity: "High", detail: "", evidenceStrength: "documentary", findingClass: "possible_forgery_redflag" });
    expect(s).toBe(95);
    expect(bandFor(s)).toBe("bill_stop");
  });
  it("Low + weak = 15 → low", () => {
    expect(scoreFinding({ code: "x", title: "", severity: "Low", detail: "", evidenceStrength: "weak" })).toBe(15);
    expect(bandFor(15)).toBe("low");
  });
  it("clamps at 100", () => {
    const s = scoreFinding({ code: "x", title: "", severity: "High", detail: "", evidenceStrength: "documentary", findingClass: "possible_forgery_redflag", valueImpact: "high", category: "CHRONOLOGY" });
    expect(s).toBe(100);
  });
  it("gradeEvidence infers grades", () => {
    expect(gradeEvidence({ code: "x", detail: "signature mismatch", category: "FORM_INTEGRITY", findingClass: "possible_forgery_redflag" })).toBe("D");
    expect(gradeEvidence({ code: "x", detail: "core cutting needed", category: "PHOTO" })).toBe("E");
    expect(gradeEvidence({ code: "x", detail: "not supplied", findingClass: "missing_proof" })).toBe("C");
  });
  it("scoreJobRisk aggregates + bands", () => {
    const r = scoreJobRisk([{ code: "a", title: "", severity: "High", detail: "", evidenceStrength: "documentary" }]);
    expect(r.score).toBe(80);
    expect(r.band).toBe("bill_stop");
  });
});

describe("chronology", () => {
  const dates = { technical_sanction: "2024-01-01", tender_notice: "2024-01-05", work_order: "2024-02-01", agreement: "2024-01-15", commencement: "2024-02-10", measurement: "2024-03-01", bill: "2024-03-05", payment: "2024-03-20" };
  it("flags agreement before work order (grade A)", () => {
    const f = checkChronology(dates);
    const ch = f.find((x) => x.code === "CH-08");
    expect(ch).toBeTruthy();
    expect(ch!.evidenceGrade).toBe("A");
  });
  it("flags missing key dates (CH-19 grade C)", () => {
    const f = checkChronology({ work_order: "2024-02-01" });
    const ch = f.find((x) => x.code === "CH-19");
    expect(ch).toBeTruthy();
    expect(ch!.evidenceGrade).toBe("C");
  });
});

describe("eligibility", () => {
  const f = checkEligibility([
    { key: "class", label: "Registration class", operator: "class_ge", required: "class-II", actual: "class-III", critical: true },
    { key: "turnover", label: "Avg turnover", operator: ">=", required: 5000000, actual: 4100000, critical: true },
    { key: "similar", label: "Similar work cert", operator: "present", actual: "", critical: true },
  ]);
  it("class III below required II → High fail", () => {
    expect(f.find((x) => x.code === "EL-01")?.severity).toBe("High");
  });
  it("missing similar-work cert → grade C", () => {
    expect(f.find((x) => x.code === "EL-03")?.evidenceGrade).toBe("C");
  });
});

describe("insurance + security", () => {
  it("policy ends before completion → IN-02; missing types → IN-06", () => {
    const f = checkInsurance([{ type: "CAR", start: "2024-01-15", end: "2024-02-01" }], { commencement: "2024-01-10", completion: "2024-03-10" });
    expect(codes(f)).toContain("IN-02");
    expect(codes(f)).toContain("IN-06"); // workmen / third_party missing
  });
  it("no required FSD figure → grade-C verify note, no shortfall assertion", () => {
    const f = checkSecurityFsd([], { fsdDeductedByBill: [5000, 0] });
    expect(codes(f)).toContain("DD-01"); // bill 2 zero
    expect(f.find((x) => x.code === "IN-08")?.evidenceGrade).toBe("C");
    expect(codes(f)).not.toContain("IN-07"); // no shortfall without a required figure
  });
});

describe("mb integrity", () => {
  it("carry-forward break across bills → MB-02 grade A", () => {
    const f = reconcileCarryForward([
      { itemCode: "5", billNo: "1", billDate: "2024-01-01", totalUptoDate: 100 },
      { itemCode: "5", billNo: "2", billDate: "2024-02-01", previousMeasurement: 120, totalUptoDate: 200 },
    ]);
    expect(f[0]?.code).toBe("MB-02");
    expect(f[0]?.evidenceGrade).toBe("A");
  });
  it("blank-signed form flag → grade D, forgery red-flag (not an accusation)", () => {
    const f = checkMbIntegrity({ formFlags: { blank_signed: true } });
    const x = f.find((y) => y.code === "MB-FORM-blank_signed");
    expect(x?.evidenceGrade).toBe("D");
    expect(x?.findingClass).toBe("possible_forgery_redflag");
    expect(x?.detail.toLowerCase()).toContain("not a finding of forgery");
  });
});

describe("royalty", () => {
  it("billed > royalty-paid with rate → RY-02 + loss exposure", () => {
    const f = reconcileRoyalty({ billedMaterialQty: 1000, royaltyPaidQty: 600, royaltyRate: 70 });
    expect(f[0]?.code).toBe("RY-02");
    expect(f[0]?.lossExposure).toBeCloseTo(28000, 0);
  });
  it("no royalty data → grade C, no ₹", () => {
    const f = reconcileRoyalty({ billedMaterialQty: 1000 });
    expect(f[0]?.code).toBe("RY-01");
    expect(f[0]?.evidenceGrade).toBe("C");
    expect(f[0]?.lossExposure).toBeUndefined();
  });
});

describe("loss-exposure", () => {
  it("computes excess-quantity exposure with caveat on every line", () => {
    const r = computeLossExposure([{ type: "excess_quantity", billedQuantity: 1420, permittedQuantity: 470, rate: 50 }]);
    expect(r.totalPossibleExposure).toBe(47500);
    expect(r.lines[0]?.caveat).toContain("not final loss");
  });
});

describe("pattern-detector", () => {
  it("same contractor across 2 jobs → pattern", () => {
    const f = detectRepeatPatterns([{ jobNumber: "A", contractor: "XYZ" }, { jobNumber: "B", contractor: "XYZ" }]);
    expect(f.length).toBeGreaterThan(0);
  });
  it("normalised names are not a mismatch; distinct job codes are", () => {
    expect(crossDocFieldMismatch([{ contractor: "ABC Ltd" }, { contractor: "abc limited" }], ["contractor"])).toEqual([]);
    expect(crossDocFieldMismatch([{ job_code: "1" }, { job_code: "2" }], ["job_code"]).length).toBe(1);
  });
});

describe("rule-engine — deductions / overrun / rate", () => {
  const baseBill: StructuredBill = {
    lineItems: [{ description: "x", qty: 1, rate: 100000, amount: 100000 }],
    taxes: [{ name: "GST", pct: 18, amount: 18000 }],
    // IT-TDS & GST-TDS both on the taxable value (₹100000 ex-GST): 2% = ₹2000 each.
    deductions: [{ name: "Income Tax (TDS)", amount: 2000 }, { name: "GST TDS", amount: 2000 }],
    subTotal: 100000, grandTotal: 118000,
  };
  it("payee=company → 2% IT-TDS (on taxable ex-GST base) not flagged as error", () => {
    const f = checkDeductionMath(baseBill, { payeeType: "company", contractValue: 1_000_000 });
    expect(codes(f)).not.toContain("DD-IT");
  });
  it("contract ≤ ₹2.5L → no GST-TDS-missing flag", () => {
    const bill = { ...baseBill, deductions: [{ name: "Income Tax (TDS)", amount: 2360 }] };
    const f = checkDeductionMath(bill, { payeeType: "company", contractValue: 200_000 });
    expect(codes(f)).not.toContain("DD-GST-MISSING");
  });
  it("overrun bands 125/200/300", () => {
    const f = checkQuantityOverrun([
      { itemCode: "1", description: "kerb", tenderQty: 100, cumulativeQty: 130 },
      { itemCode: "2", description: "wmm", tenderQty: 100, cumulativeQty: 350 },
    ]);
    expect(f.find((x) => x.code === "QT-OVERRUN" && x.actual?.includes("130%"))?.valueImpact).toBe("low");
    expect(f.find((x) => x.actual?.includes("350%"))?.evidenceGrade).toBe("E"); // wmm = hidden
  });
  it("bill rate above agreement rate → RT-01", () => {
    const f = checkRateAbuse([{ itemCode: "5", description: "wmm", tenderQty: 100, cumulativeQty: 100, rate: 60 }], new Map([["5", 50]]), []);
    expect(codes(f)).toContain("RT-01");
  });
  it("EXCESS_SANCTION uses the 10% cap (not 0.5%)", () => {
    const within = runBillRules({ ...baseBill, sanctionedAmount: 110000 }); // 118000 ≤ 121000 allowed
    expect(codes(within)).not.toContain("EXCESS_SANCTION");
    const over = runBillRules({ ...baseBill, sanctionedAmount: 100000 }); // allowed 110000 < 118000
    expect(codes(over)).toContain("EXCESS_SANCTION");
  });
  it("flags missing BOCW labour-welfare cess; accepts correct 1%", () => {
    const missing = checkDeductionMath(baseBill, { payeeType: "company", contractValue: 1_000_000 });
    expect(codes(missing)).toContain("DD-CESS-MISSING");
    const withCess = checkDeductionMath(
      { ...baseBill, deductions: [...baseBill.deductions, { name: "Labour cess", amount: 1000 }] }, // 1% of 100000
      { payeeType: "company", contractValue: 1_000_000 },
    );
    expect(codes(withCess)).not.toContain("DD-CESS-MISSING");
    expect(codes(withCess)).not.toContain("DD-CESS");
  });
  it("THRESHOLD: exactly AT a limit is not flagged 'below'; just under is", () => {
    const at = runBillRules({ lineItems: [{ description: "x", qty: 1, rate: 500000, amount: 500000 }], taxes: [], deductions: [], subTotal: 500000, grandTotal: 500000 });
    expect(codes(at)).not.toContain("THRESHOLD");
    const under = runBillRules({ lineItems: [{ description: "x", qty: 1, rate: 495000, amount: 495000 }], taxes: [], deductions: [], subTotal: 495000, grandTotal: 495000 });
    expect(codes(under)).toContain("THRESHOLD");
  });
});

describe("completion certificate / DLP", () => {
  it("flags a billed work with no completion certificate", () => {
    const f = checkCompletionAndDlp({ bill: "01-02-2024", measurement: "20-01-2024" });
    expect(codes(f)).toContain("CH-20");
  });
  it("flags completion with no DLP end, and computes the expected end", () => {
    const f = checkCompletionAndDlp({ measurement: "20-01-2024", completion: "01-03-2024" }, { dlpMonths: 12 });
    const dlp = f.find((x) => x.code === "CH-21");
    expect(dlp).toBeTruthy();
    expect(dlp!.detail).toContain("2025-03-01");
  });
  it("no completion finding when nothing was executed", () => {
    expect(checkCompletionAndDlp({})).toHaveLength(0);
  });
});
