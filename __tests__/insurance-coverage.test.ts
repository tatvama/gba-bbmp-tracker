import { describe, it, expect } from "vitest";
import { parseRupees, buildInsuranceCoverageTable } from "../lib/intelligence/insurance-coverage";
import type { DocRefItem } from "../lib/ai/extractors/document-facts";

describe("parseRupees", () => {
  it("parses Indian-grouped rupee strings with decimals", () => {
    expect(parseRupees("Rs. 19,28,41,746.62")).toBeCloseTo(192841746.62, 2);
  });
  it("parses ₹ and trailing /-", () => {
    expect(parseRupees("₹1,23,456/-")).toBe(123456);
  });
  it("parses a bare grouped number", () => {
    expect(parseRupees("19,28,41,746")).toBe(192841746);
  });
  it("honours crore / lakh / thousand scale words (common in BBMP docs)", () => {
    expect(parseRupees("Rs. 19.28 Crore")).toBeCloseTo(192800000, 0);
    expect(parseRupees("Rupees 2.5 Crore")).toBe(25000000);
    expect(parseRupees("Rs. 45.60 Lakh")).toBeCloseTo(4560000, 0);
    expect(parseRupees("Rs 3 crores")).toBe(30000000);
    expect(parseRupees("₹12 thousand")).toBe(12000);
  });
  it("does NOT fuse an amount with an adjacent date / second number", () => {
    expect(parseRupees("Rs. 1,23,45,678 (01.01.2020)")).toBe(12345678);
    expect(parseRupees("Rs 12345678 to 20000000")).toBe(12345678);
  });
  it("returns null for empty / junk / zero", () => {
    expect(parseRupees("")).toBeNull();
    expect(parseRupees(null)).toBeNull();
    expect(parseRupees(undefined)).toBeNull();
    expect(parseRupees("Rupees only")).toBeNull();
    expect(parseRupees("0")).toBeNull();
  });
});

describe("buildInsuranceCoverageTable", () => {
  it("returns null for a non-works case with no agreement and no policy", () => {
    expect(
      buildInsuranceCoverageTable({ policies: [], agreementValue: null, isWorksCase: false }),
    ).toBeNull();
  });

  it("builds the 5 canonical KW-4 rows, all 'Not on record' when no policy is present", () => {
    const table = buildInsuranceCoverageTable({
      policies: [],
      agreementValue: 192841746.62,
      agreementValueRaw: "19,28,41,746.62",
      isWorksCase: true,
    });
    expect(table).not.toBeNull();
    expect(table!.rows).toHaveLength(5);
    expect(table!.rows.map((r) => r.coverType)).toEqual([
      "Works, Plant and Materials",
      "Loss or damage to Contractor's Equipment",
      "Loss or damage to property of third party",
      "Personal injury or death (third party)",
      "Personal injury or death (contractor's employees and labour)",
    ]);
    expect(table!.rows.every((r) => r.status === "Not on record")).toBe(true);
    expect(table!.policiesFound).toBe(0);
  });

  it("computes the Works cover minimum as agreement value + 20% with Indian grouping", () => {
    const table = buildInsuranceCoverageTable({
      policies: [],
      agreementValue: 192841746.62,
      agreementValueRaw: "19,28,41,746.62",
      isWorksCase: true,
    })!;
    const works = table.rows[0]!.minimumRequired;
    // 192841746.62 * 1.2 = 231410095.94 -> round -> 231410096
    expect(works).toContain("23,14,10,096");
    // the verbatim agreement value is preserved for display
    expect(works).toContain("19,28,41,746.62");
    expect(works).toMatch(/plus 20%/i);
  });

  it("falls back to a generic minimum when the agreement value is unknown", () => {
    const table = buildInsuranceCoverageTable({
      policies: [{ number: "POL/1", policyType: "CAR" }],
      agreementValue: null,
      isWorksCase: true,
    })!;
    expect(table.rows[0]!.minimumRequired).toBe("Agreement value plus 20%");
  });

  it("marks the Works row 'On record' when a CAR / works policy is present", () => {
    const policies: DocRefItem[] = [
      { number: "CAR/2026/55", insurer: "New India Assurance", policyType: "Contractors All Risk", amount: "₹23,00,00,000" },
    ];
    const table = buildInsuranceCoverageTable({ policies, agreementValue: 192841746, agreementValueRaw: "19,28,41,746", isWorksCase: true })!;
    expect(table.rows[0]!.status).toContain("On record");
    expect(table.rows[0]!.status).toContain("CAR/2026/55");
    expect(table.rows[0]!.status).toContain("New India Assurance");
    expect(table.policiesFound).toBe(1);
    // an unrelated cover type stays not on record
    expect(table.rows[1]!.status).toBe("Not on record");
  });

  it("does NOT false-light the Works row from an unrelated motor or equipment policy", () => {
    // A motor "Private Car" policy must not match the Works/CAR row (case-sensitive CAR).
    const motor = buildInsuranceCoverageTable({
      policies: [{ number: "MOT/1", policyType: "Private Car Package Policy", insurer: "ICICI Lombard" }],
      agreementValue: null,
      isWorksCase: true,
    })!;
    expect(motor.rows[0]!.status).toBe("Not on record");
    // A Contractor's Plant & Machinery (CPM) policy is EQUIPMENT cover, not Works.
    const cpm = buildInsuranceCoverageTable({
      policies: [{ number: "CPM/7", policyType: "Contractor Plant and Machinery" }],
      agreementValue: null,
      isWorksCase: true,
    })!;
    expect(cpm.rows[0]!.status).toBe("Not on record"); // Works
    expect(cpm.rows[1]!.status).toContain("On record"); // Equipment
  });

  it("matches the plural 'Contractors All Risks' to the Works row", () => {
    const table = buildInsuranceCoverageTable({
      policies: [{ number: "AR/22", policyType: "Contractors All Risks" }],
      agreementValue: null,
      isWorksCase: true,
    })!;
    expect(table.rows[0]!.status).toContain("On record");
  });

  it("matches a Workmen's Compensation policy to the labour row", () => {
    const policies: DocRefItem[] = [{ number: "WC/9", policyType: "Workmen Compensation" }];
    const table = buildInsuranceCoverageTable({ policies, agreementValue: null, isWorksCase: true })!;
    expect(table.rows[4]!.status).toContain("On record");
    expect(table.rows[4]!.status).toContain("WC/9");
    expect(table.rows[0]!.status).toBe("Not on record");
  });

  it("builds even for a non-works case when a policy is on record", () => {
    const table = buildInsuranceCoverageTable({
      policies: [{ number: "POL/X", policyType: "third party" }],
      agreementValue: null,
      isWorksCase: false,
    });
    expect(table).not.toBeNull();
    expect(table!.rows[2]!.status).toContain("On record"); // third-party property
  });

  it("cell text carries no en/em dashes (safe-language gate would rewrite them)", () => {
    const table = buildInsuranceCoverageTable({
      policies: [],
      agreementValue: 192841746.62,
      agreementValueRaw: "19,28,41,746.62",
      isWorksCase: true,
    })!;
    for (const r of table.rows) {
      for (const cell of [r.coverType, r.minimumRequired, r.status]) {
        expect(cell).not.toMatch(/[–—―−]/); // en, em, horizontal bar, minus
        expect(cell).not.toContain("|"); // a pipe would break the Markdown table
      }
    }
  });

  it("provides an explanatory note in both the empty and populated cases", () => {
    const empty = buildInsuranceCoverageTable({ policies: [], agreementValue: 1, isWorksCase: true })!;
    expect(empty.note).toMatch(/no insurance policy/i);
    expect(empty.note).toMatch(/13\.2/);
    const populated = buildInsuranceCoverageTable({
      policies: [{ number: "POL/1", policyType: "CAR" }],
      agreementValue: 1,
      isWorksCase: true,
    })!;
    expect(populated.note).toMatch(/policies visible in the record/i);
    expect(populated.note).toContain("POL/1");
  });
});
