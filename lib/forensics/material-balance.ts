/**
 * Material-balance / theoretical-consumption checks (PURE, testable).
 * Derives expected material from billed dimensions using standard IS/MoRTH
 * coefficients, so billed/royalty quantities can be reconciled against what the
 * work should physically have consumed. Coefficients are typical values —
 * configurable; treat outputs as indicative.
 */

export const MATERIAL_COEFFICIENTS = {
  bituminousMixDensity: 2.4, // tonnes per m³ of compacted BC/DBM
  bcBitumenPct: 5.5, // % bitumen by weight in Bituminous Concrete
  dbmBitumenPct: 4.5, // % bitumen by weight in Dense Bituminous Macadam
  cementBagsPerCumM20: 8.0, // ~8 bags (50kg) cement per m³ of M20
  cementBagsPerCumM25: 9.0,
  steelKgPerCumRcc: 80, // typical RCC steel (varies 60–120)
};

export interface BituminousExpectation {
  mixTonnes: number;
  bitumenTonnes: number;
}

/** Expected bituminous mix + bitumen for a paved area at a given thickness. */
export function expectedBituminous(input: {
  areaSqm: number;
  thicknessMm: number;
  layer: "BC" | "DBM";
}): BituminousExpectation {
  const volumeCum = input.areaSqm * (input.thicknessMm / 1000);
  const mixTonnes = volumeCum * MATERIAL_COEFFICIENTS.bituminousMixDensity;
  const pct = input.layer === "BC" ? MATERIAL_COEFFICIENTS.bcBitumenPct : MATERIAL_COEFFICIENTS.dbmBitumenPct;
  return { mixTonnes, bitumenTonnes: (mixTonnes * pct) / 100 };
}

export interface ConcreteExpectation {
  cementBags: number;
  steelKg: number;
}

/** Expected cement (bags) + RCC steel for a concrete volume. */
export function expectedConcrete(input: { volumeCum: number; grade?: "M20" | "M25"; rcc?: boolean }): ConcreteExpectation {
  const bagsPer = input.grade === "M25" ? MATERIAL_COEFFICIENTS.cementBagsPerCumM25 : MATERIAL_COEFFICIENTS.cementBagsPerCumM20;
  return {
    cementBags: input.volumeCum * bagsPer,
    steelKg: input.rcc ? input.volumeCum * MATERIAL_COEFFICIENTS.steelKgPerCumRcc : 0,
  };
}

/** Compare a billed quantity to the theoretical expectation (% variance). */
export function reconcile(billed: number, expected: number): { variancePct: number; flag: "ok" | "over" | "under" } {
  if (expected <= 0) return { variancePct: 0, flag: "ok" };
  const variancePct = ((billed - expected) / expected) * 100;
  if (variancePct > 10) return { variancePct, flag: "over" };
  if (variancePct < -10) return { variancePct, flag: "under" };
  return { variancePct, flag: "ok" };
}
