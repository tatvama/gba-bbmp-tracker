import { describe, it, expect } from "vitest";
import { parseIndianDate, isAfter } from "../lib/forensics/date-parse";
import { expectedGstPct } from "../lib/forensics/gst";

describe("parseIndianDate", () => {
  it("parses the five accepted formats", () => {
    expect(parseIndianDate("1990-05-15")?.toISOString().slice(0, 10)).toBe("1990-05-15");
    expect(parseIndianDate("15-05-1990")?.toISOString().slice(0, 10)).toBe("1990-05-15");
    expect(parseIndianDate("15/05/1990")?.toISOString().slice(0, 10)).toBe("1990-05-15");
    expect(parseIndianDate("1990/05/15")?.toISOString().slice(0, 10)).toBe("1990-05-15");
    expect(parseIndianDate("15.05.1990")?.toISOString().slice(0, 10)).toBe("1990-05-15");
  });
  it("returns null for garbage and never an Invalid Date", () => {
    expect(parseIndianDate("not a date")).toBeNull();
    expect(parseIndianDate("")).toBeNull();
    expect(parseIndianDate(null)).toBeNull();
    expect(parseIndianDate("31-02-2024")).toBeNull(); // overflow rejected
    expect(parseIndianDate("2024-13-01")).toBeNull();
  });
  it("isAfter compares correctly", () => {
    expect(isAfter(parseIndianDate("2024-02-01"), parseIndianDate("2024-01-01"))).toBe(true);
    expect(isAfter(parseIndianDate("2024-01-01"), parseIndianDate("2024-02-01"))).toBe(false);
    expect(isAfter(null, parseIndianDate("2024-01-01"))).toBe(false);
  });
});

describe("expectedGstPct", () => {
  it("returns 18% on/after the GST 2.0 cutover", () => {
    expect(expectedGstPct("2025-10-01").pct).toBe(18);
    expect(expectedGstPct("2025-09-22").pct).toBe(18);
  });
  it("returns 5% for predominantly-earthwork contracts before cutover", () => {
    expect(expectedGstPct("2025-09-21", 80).pct).toBe(5);
  });
  it("returns 12% for general works contracts before cutover", () => {
    expect(expectedGstPct("2025-09-21").pct).toBe(12);
    expect(expectedGstPct("2025-09-21", 50).pct).toBe(12);
  });
  it("defaults to 18% with a verify note when the date is unknown", () => {
    const r = expectedGstPct(null);
    expect(r.pct).toBe(18);
    expect(r.basis.toLowerCase()).toContain("verify");
  });
});
