/**
 * Statistical fraud analytics (PURE, framework-free, unit-tested).
 * Benford's-Law digit analysis, just-below-threshold clustering, and IQR
 * outliers — patterns visible only across many bills. Indicators for review.
 */

export function leadingDigit(value: number): number | null {
  const n = Math.abs(value);
  if (!Number.isFinite(n) || n < 1) return null;
  const s = n.toExponential();
  const d = parseInt(s[0]!, 10);
  return d >= 1 && d <= 9 ? d : null;
}

export interface BenfordResult {
  n: number;
  counts: number[]; // index 0 = digit 1 … index 8 = digit 9
  observedPct: number[];
  expectedPct: number[];
  mad: number; // mean absolute deviation (proportions)
  conformity: "close" | "acceptable" | "marginal" | "nonconforming" | "insufficient";
}

const BENFORD_EXPECTED = Array.from({ length: 9 }, (_, i) => Math.log10(1 + 1 / (i + 1)));

/** Benford first-digit test. MAD thresholds per Nigrini. */
export function benford(values: number[]): BenfordResult {
  const counts = new Array(9).fill(0);
  let n = 0;
  for (const v of values) {
    const d = leadingDigit(v);
    if (d) {
      counts[d - 1]++;
      n++;
    }
  }
  const observedPct = counts.map((c) => (n ? c / n : 0));
  const mad = n ? observedPct.reduce((s, o, i) => s + Math.abs(o - BENFORD_EXPECTED[i]!), 0) / 9 : 0;
  let conformity: BenfordResult["conformity"];
  if (n < 50) conformity = "insufficient";
  else if (mad < 0.006) conformity = "close";
  else if (mad < 0.012) conformity = "acceptable";
  else if (mad < 0.015) conformity = "marginal";
  else conformity = "nonconforming";
  return { n, counts, observedPct, expectedPct: BENFORD_EXPECTED, mad, conformity };
}

/** Count values sitting within `pct` just BELOW each threshold (splitting signal). */
export function thresholdClusters(
  values: number[],
  thresholds: number[],
  pct = 0.03,
): { threshold: number; count: number }[] {
  return thresholds
    .map((th) => ({
      threshold: th,
      count: values.filter((v) => v <= th && v >= th * (1 - pct)).length,
    }))
    .filter((x) => x.count > 0);
}

/** Tukey IQR outliers (high side — over-billing). */
export function iqrOutliers(values: number[]): { high: number | null; outliers: number[] } {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length < 8) return { high: null, outliers: [] };
  const q = (p: number) => {
    const idx = (v.length - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return v[lo]! + (v[hi]! - v[lo]!) * (idx - lo);
  };
  const q1 = q(0.25), q3 = q(0.75);
  const high = q3 + 1.5 * (q3 - q1);
  return { high, outliers: v.filter((x) => x > high) };
}
