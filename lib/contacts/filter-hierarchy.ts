import type { ContactWithRelations } from "@/lib/types";

// --------------------------------------------------------------------------
// Contact directory: division / sub-division / ward matching (pure)
//
// A contact carries its BBMP location in one of two ways, and the filter must
// honour both:
//   1. Engineers   — an eng_subdivision / division FK; the wards they are
//      responsible for are the wards that sit under that sub-division.
//   2. ARO officers (imported) — no division/sub-division FK at all, but an
//      explicit list of ward jurisdictions (contact_jurisdictions.ward_no).
//
// So we index every ward (BBMP-225 `new_no`) to its division + sub-division
// once, then match a contact if EITHER its own FK OR any of its jurisdiction
// wards lands in the selected slice of the hierarchy.
// --------------------------------------------------------------------------

export type WardHierarchyIndex = Map<
  number,
  { division: string | null; subDivision: string | null }
>;

/** ward `new_no` -> its division / sub-division names. */
export function buildWardIndex(
  wards: {
    new_no: number | null;
    division?: { name: string } | null;
    eng_subdivision?: { name: string } | null;
  }[],
): WardHierarchyIndex {
  const m: WardHierarchyIndex = new Map();
  for (const w of wards) {
    if (w.new_no != null) {
      m.set(w.new_no, {
        division: w.division?.name ?? null,
        subDivision: w.eng_subdivision?.name ?? null,
      });
    }
  }
  return m;
}

export type HierarchySelection = {
  division: string; // "all" | division name
  subDivision: string; // "all" | sub-division name
  ward: string; // "all" | String(new_no)
};

/**
 * True if `c` belongs to the selected division / sub-division / ward. Each
 * dimension is an AND; "all" means unfiltered. Both the engineer FK path and
 * the ARO ward-jurisdiction path are accepted for every dimension.
 */
export function contactMatchesHierarchy(
  c: Pick<ContactWithRelations, "division" | "eng_subdivision" | "jurisdictions">,
  sel: HierarchySelection,
  wardIndex: WardHierarchyIndex,
): boolean {
  const jur = c.jurisdictions ?? [];

  if (sel.division !== "all") {
    const viaFk = c.division?.name === sel.division;
    const viaWard = jur.some(
      (j) => j.ward_no != null && wardIndex.get(j.ward_no)?.division === sel.division,
    );
    if (!viaFk && !viaWard) return false;
  }

  if (sel.subDivision !== "all") {
    const viaFk = c.eng_subdivision?.name === sel.subDivision;
    const viaWard = jur.some(
      (j) => j.ward_no != null && wardIndex.get(j.ward_no)?.subDivision === sel.subDivision,
    );
    if (!viaFk && !viaWard) return false;
  }

  if (sel.ward !== "all") {
    const viaJurisdiction = jur.some((j) => String(j.ward_no ?? "") === sel.ward);
    // an engineer attached at a sub-division covers every ward under it
    const selSub = wardIndex.get(Number(sel.ward))?.subDivision ?? null;
    const viaSubdiv = !!selSub && c.eng_subdivision?.name === selSub;
    if (!viaJurisdiction && !viaSubdiv) return false;
  }

  return true;
}
