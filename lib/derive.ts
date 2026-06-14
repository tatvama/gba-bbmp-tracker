/**
 * AC → Corporation derivation.
 *
 * There is NO shared key between BBMP-225 and GBA-369; the only reliable link
 * is the Assembly Constituency (AC). Each BBMP-225 ward carries an AC such as
 * "175-Bommanahalli", and each GBA corporation lists the ACs it contains.
 *
 * Source data quirk: a handful of wards carry a *combined* AC string, e.g.
 * "176-Bengaluru South & 177-Anekal". We therefore match by the AC NUMBER
 * (numeric prefix), not the full string. "177-Anekal" is outside the 5 GBA
 * corporations, so "176 & 177" resolves unambiguously to the corporation that
 * contains AC 176 (DAKSHINA). The derived link is ALWAYS labelled "derived"
 * in the UI and never presented as authoritative.
 *
 * This module is pure (no framework deps) so it is shared by seed + tests.
 */

export interface CorpAcSource {
  code: string;
  assembly_constituencies: string[];
}

/** All AC numbers mentioned in an AC string, e.g. "176-... & 177-..." → ["176","177"]. */
export function acNumbers(ac: string): string[] {
  return ac.match(/\d+/g) ?? [];
}

/** Build a lookup from AC number (e.g. "175") to corporation code. */
export function buildAcNumberToCorp(corps: CorpAcSource[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const corp of corps) {
    for (const ac of corp.assembly_constituencies) {
      const m = ac.match(/^\s*(\d+)/);
      if (m && m[1]) map.set(m[1], corp.code);
    }
  }
  return map;
}

export interface DerivationResult {
  /** Resolved corporation code, or null if none / ambiguous. */
  code: string | null;
  /** True when the source AC string contained more AC numbers than the one matched
   *  (i.e. a combined string was normalised) — drives a provenance note. */
  normalisedFromCombined: boolean;
}

/**
 * Derive the GBA corporation for a ward's AC string.
 * Returns exactly one corporation, or null when zero or multiple distinct
 * corporations match (ambiguous — must stay unmapped + flagged, never guessed).
 */
export function deriveCorporation(
  ac: string,
  acNumToCorp: Map<string, string>,
): DerivationResult {
  const nums = acNumbers(ac);
  const corps = new Set<string>();
  for (const n of nums) {
    const c = acNumToCorp.get(n);
    if (c) corps.add(c);
  }
  if (corps.size === 1) {
    let code: string | null = null;
    for (const c of corps) code = c;
    return { code, normalisedFromCombined: nums.length > 1 };
  }
  return { code: null, normalisedFromCombined: false };
}

/** Convenience: derive just the code (null if unmapped/ambiguous). */
export function deriveCorporationCode(
  ac: string,
  acNumToCorp: Map<string, string>,
): string | null {
  return deriveCorporation(ac, acNumToCorp).code;
}
