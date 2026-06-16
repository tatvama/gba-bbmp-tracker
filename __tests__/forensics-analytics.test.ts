import { describe, it, expect } from "vitest";
import { leadingDigit, benford, thresholdClusters, iqrOutliers } from "../lib/forensics/analytics";
import { expectedBituminous, expectedConcrete, reconcile } from "../lib/forensics/material-balance";

describe("leadingDigit", () => {
  it("extracts the first significant digit", () => {
    expect(leadingDigit(492000)).toBe(4);
    expect(leadingDigit(0.0073)).toBe(null); // < 1
    expect(leadingDigit(1234)).toBe(1);
    expect(leadingDigit(9)).toBe(9);
  });
});

describe("benford", () => {
  it("flags 'insufficient' for small samples", () => {
    expect(benford([1, 2, 3]).conformity).toBe("insufficient");
  });
  it("a Benford-distributed set is close/acceptable", () => {
    // 1..9 in Benford proportions over ~900 values
    const vals: number[] = [];
    const exp = Array.from({ length: 9 }, (_, i) => Math.log10(1 + 1 / (i + 1)));
    exp.forEach((p, i) => {
      // (i+1)*1000 + k keeps the leading digit fixed at i+1 (k < 1000).
      for (let k = 0; k < Math.round(p * 900); k++) vals.push((i + 1) * 1000 + k);
    });
    const r = benford(vals);
    expect(r.n).toBeGreaterThan(800);
    expect(["close", "acceptable"]).toContain(r.conformity);
  });
  it("a manipulated set (all leading 9) is nonconforming", () => {
    const vals = Array.from({ length: 100 }, (_, k) => 900000 + k);
    expect(benford(vals).conformity).toBe("nonconforming");
  });
});

describe("thresholdClusters", () => {
  it("counts values just below a threshold", () => {
    const r = thresholdClusters([492000, 495000, 300000, 500001], [500000], 0.03);
    expect(r[0]!.count).toBe(2); // 492000 and 495000
  });
});

describe("iqrOutliers", () => {
  it("flags a high outlier", () => {
    const r = iqrOutliers([10, 11, 12, 13, 12, 11, 10, 13, 200]);
    expect(r.outliers).toContain(200);
  });
});

describe("material balance", () => {
  it("computes expected bitumen for a BC layer", () => {
    // 1000 sqm × 40mm = 40 m³ × 2.4 = 96 t mix × 5.5% = 5.28 t bitumen
    const e = expectedBituminous({ areaSqm: 1000, thicknessMm: 40, layer: "BC" });
    expect(e.mixTonnes).toBeCloseTo(96, 1);
    expect(e.bitumenTonnes).toBeCloseTo(5.28, 1);
  });
  it("computes expected cement bags for M20", () => {
    expect(expectedConcrete({ volumeCum: 10, grade: "M20" }).cementBags).toBeCloseTo(80, 1);
  });
  it("reconcile flags over-billing beyond 10%", () => {
    expect(reconcile(120, 100).flag).toBe("over");
    expect(reconcile(105, 100).flag).toBe("ok");
    expect(reconcile(80, 100).flag).toBe("under");
  });
});
