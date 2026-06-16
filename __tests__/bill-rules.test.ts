import { describe, it, expect } from "vitest";
import { runBillRules, scoreFindings } from "../lib/forensics/rule-engine";
import type { StructuredBill } from "../lib/forensics/types";

function codes(b: StructuredBill) {
  return runBillRules(b).map((f) => f.code);
}

const clean: StructuredBill = {
  lineItems: [
    { description: "WMM", unit: "cum", qty: 100, rate: 50, amount: 5000 },
    { description: "BC", unit: "sqm", qty: 200, rate: 25, amount: 5000 },
  ],
  taxes: [{ name: "GST", pct: 18, amount: 1800 }],
  deductions: [
    { name: "Royalty", amount: 200 },
    { name: "Income Tax (TDS)", amount: 200 },
    { name: "GST TDS", amount: 100 },
    { name: "Security Deposit", amount: 500 },
  ],
  subTotal: 10000,
  grandTotal: 11800,
  sanctionedAmount: 15000,
};

describe("runBillRules — clean bill", () => {
  it("produces no findings for an internally consistent bill", () => {
    expect(runBillRules(clean)).toEqual([]);
  });
});

describe("arithmetic checks", () => {
  it("flags a line where qty × rate ≠ amount", () => {
    const b = { ...clean, lineItems: [{ description: "WMM", qty: 100, rate: 50, amount: 9000 }, clean.lineItems[1]!] };
    expect(codes(b)).toContain("ARITH_LINE");
  });

  it("flags a sub-total that doesn't equal the line sum", () => {
    const b = { ...clean, subTotal: 12000 };
    expect(codes(b)).toContain("ARITH_SUBTOTAL");
  });

  it("flags a grand total that doesn't reconcile", () => {
    const b = { ...clean, grandTotal: 13000 };
    expect(codes(b)).toContain("ARITH_TOTAL");
  });

  it("flags a miscalculated tax", () => {
    const b = { ...clean, taxes: [{ name: "GST", pct: 18, amount: 2500 }], grandTotal: 12500 };
    const c = codes(b);
    expect(c).toContain("TAX_CALC");
  });
});

describe("recoveries + sanction + patterns", () => {
  it("flags missing statutory recoveries", () => {
    const b: StructuredBill = { ...clean, deductions: [] };
    const c = codes(b);
    expect(c.filter((x) => x === "REC_MISSING").length).toBeGreaterThanOrEqual(3);
  });

  it("flags billed amount exceeding sanction", () => {
    const b = { ...clean, sanctionedAmount: 8000 };
    expect(codes(b)).toContain("EXCESS_SANCTION");
  });

  it("flags an exact round grand total", () => {
    const b: StructuredBill = {
      lineItems: [{ description: "x", qty: 1, rate: 500000, amount: 500000 }],
      taxes: [],
      deductions: [{ name: "Royalty" }, { name: "Income Tax" }, { name: "GST" }, { name: "Security Deposit" }].map((d) => ({ ...d, amount: 0 })),
      subTotal: 500000,
      grandTotal: 500000,
    };
    expect(codes(b)).toContain("ROUND_NUMBER");
  });

  it("flags a total sitting just below an approval threshold", () => {
    const b: StructuredBill = {
      lineItems: [{ description: "x", qty: 1, rate: 492000, amount: 492000 }],
      taxes: [],
      deductions: [{ name: "Royalty" }, { name: "Income Tax" }, { name: "GST" }, { name: "Security Deposit" }].map((d) => ({ ...d, amount: 0 })),
      subTotal: 492000,
      grandTotal: 492000,
    };
    expect(codes(b)).toContain("THRESHOLD");
  });
});

describe("scoreFindings", () => {
  it("weights severity and counts red flags", () => {
    const r = scoreFindings([
      { code: "A", title: "", severity: "High", detail: "" },
      { code: "B", title: "", severity: "Medium", detail: "" },
      { code: "C", title: "", severity: "Low", detail: "" },
    ]);
    expect(r.score).toBe(15);
    expect(r.redFlagCount).toBe(2);
  });
});
