import { describe, it, expect } from "vitest";
import { normalizeAmount, normalizeDate, normalizeJobNumber, normalizePhoneNumber } from "@/lib/bbmp-works/normalize";
import { calculateFinancialProgress, calculatePendingAmount } from "@/lib/bbmp-works/calculations";
import { getWorkStatus, resolveWorkStatus } from "@/lib/bbmp-works/status";
import { detectConflicts, getVerificationStatus } from "@/lib/bbmp-works/verification";
import { validateWorkSearchRequest } from "@/lib/bbmp-works/types";

describe("normalizeAmount", () => {
  it("strips currency symbol, commas, whitespace", () => {
    expect(normalizeAmount("₹29,89,000")).toBe(2989000);
    expect(normalizeAmount("Rs 12,345")).toBe(12345);
    expect(normalizeAmount(2989000)).toBe(2989000);
  });
  it("returns null for junk", () => {
    expect(normalizeAmount("")).toBeNull();
    expect(normalizeAmount(null)).toBeNull();
  });
});

describe("normalizePhoneNumber", () => {
  it("keeps the last 10 digits", () => {
    expect(normalizePhoneNumber("+91 98765 43210")).toBe("9876543210");
    expect(normalizePhoneNumber("9876543210")).toBe("9876543210");
  });
  it("returns null for empty input", () => {
    expect(normalizePhoneNumber(null)).toBeNull();
    expect(normalizePhoneNumber("")).toBeNull();
  });
});

describe("normalizeJobNumber", () => {
  it("cleans and canonicalizes a job code", () => {
    expect(normalizeJobNumber(" 186_23_000001 ")).toBe("186-23-000001");
    expect(normalizeJobNumber("186–23–000001")).toBe("186-23-000001"); // en-dash
  });
  it("falls back to the cleaned literal for non-job-code identifiers", () => {
    expect(normalizeJobNumber("wo-1234")).toBe("WO-1234");
  });
  it("returns null for empty input", () => {
    expect(normalizeJobNumber(null)).toBeNull();
    expect(normalizeJobNumber("")).toBeNull();
  });
});

describe("normalizeDate", () => {
  it("parses to YYYY-MM-DD", () => {
    expect(normalizeDate("2026-07-13")).toBe("2026-07-13");
  });
  it("returns null for an invalid date", () => {
    expect(normalizeDate("not a date")).toBeNull();
    expect(normalizeDate(null)).toBeNull();
  });
});

describe("calculatePendingAmount", () => {
  it("is sanctioned minus paid, floored at 0", () => {
    expect(calculatePendingAmount(100, 40)).toBe(60);
    expect(calculatePendingAmount(100, 150)).toBe(0);
    expect(calculatePendingAmount(null, null)).toBe(0);
  });
});

describe("calculateFinancialProgress", () => {
  it("is paid/sanctioned * 100, rounded to 2dp", () => {
    expect(calculateFinancialProgress(50, 200)).toBe(25);
    expect(calculateFinancialProgress(33.333, 100)).toBe(33.33);
  });
  it("is null with no sanctioned amount", () => {
    expect(calculateFinancialProgress(50, null)).toBeNull();
    expect(calculateFinancialProgress(50, 0)).toBeNull();
  });
});

describe("getWorkStatus", () => {
  it("buckets by percentage", () => {
    expect(getWorkStatus(0)).toBe("Not Started");
    expect(getWorkStatus(45)).toBe("In Progress");
    expect(getWorkStatus(100)).toBe("Completed");
    expect(getWorkStatus(null)).toBe("Status Unknown");
  });
});

describe("resolveWorkStatus", () => {
  it("prefers the explicit status when set", () => {
    expect(resolveWorkStatus("Tender Awarded", 0)).toBe("Tender Awarded");
  });
  it("falls back to getWorkStatus when unset", () => {
    expect(resolveWorkStatus(null, 50)).toBe("In Progress");
    expect(resolveWorkStatus("", 100)).toBe("Completed");
  });
});

describe("getVerificationStatus", () => {
  it("applies the 4-state tiering rule", () => {
    expect(getVerificationStatus(0, false)).toBe("Unverified");
    expect(getVerificationStatus(1, false)).toBe("Partially Verified");
    expect(getVerificationStatus(2, false)).toBe("Verified");
    expect(getVerificationStatus(3, false)).toBe("Verified");
  });
  it("conflicting data wins regardless of source count", () => {
    expect(getVerificationStatus(3, true)).toBe("Conflicting Information");
  });
});

describe("detectConflicts", () => {
  it("is false when sources agree after normalization", () => {
    const sources = [
      { fieldSnapshot: { sanctionedAmount: "₹29,89,000" } },
      { fieldSnapshot: { sanctionedAmount: 2989000 } },
    ];
    expect(detectConflicts(sources)).toBe(false);
  });
  it("is true when two sources disagree on the same field", () => {
    const sources = [
      { fieldSnapshot: { sanctionedAmount: 2989000 } },
      { fieldSnapshot: { sanctionedAmount: 3100000 } },
    ];
    expect(detectConflicts(sources)).toBe(true);
  });
  it("is false with fewer than two sources", () => {
    expect(detectConflicts([{ fieldSnapshot: { sanctionedAmount: 100 } }])).toBe(false);
    expect(detectConflicts([])).toBe(false);
  });
});

describe("validateWorkSearchRequest", () => {
  it("requires at least one non-empty field", () => {
    expect(validateWorkSearchRequest({})).toBe(false);
    expect(validateWorkSearchRequest({ jobNumber: "  " })).toBe(false);
    expect(validateWorkSearchRequest({ wardNumber: "42" })).toBe(true);
  });
});
