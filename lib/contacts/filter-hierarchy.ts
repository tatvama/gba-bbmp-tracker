import type { ContactWithRelations } from "@/lib/types";

/** Minimal shape this file needs from a contact_jurisdictions row. */
interface JurisdictionWardNo {
  ward_no: number | null;
}

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
  {
    division: string | null;
    subDivision: string | null;
    /** Additive — populated whenever the caller's ward query embeds `.id` on
     *  division/eng_subdivision (every existing caller's WardWithRelations
     *  embed already does), so lib/mail/recommend-recipients.ts can match by
     *  the complaint's real FK ids without a second query shape. */
    divisionId: string | null;
    subDivisionId: string | null;
  }
>;

/** ward `new_no` -> its division / sub-division names (+ ids, additive). */
export function buildWardIndex(
  wards: {
    new_no: number | null;
    division?: { id?: string; name: string } | null;
    eng_subdivision?: { id?: string; name: string } | null;
  }[],
): WardHierarchyIndex {
  const m: WardHierarchyIndex = new Map();
  for (const w of wards) {
    if (w.new_no != null) {
      m.set(w.new_no, {
        division: w.division?.name ?? null,
        subDivision: w.eng_subdivision?.name ?? null,
        divisionId: w.division?.id ?? null,
        subDivisionId: w.eng_subdivision?.id ?? null,
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

// --------------------------------------------------------------------------
// ID-keyed sibling of the above, for matching a CONCRETE complaint's
// corporation_id/division_id/eng_subdivision_id (real FKs) rather than a
// user's string dropdown selection ("all" | name). Kept separate from
// contactMatchesHierarchy — which the /contacts filter UI keeps using
// unchanged — because a name-string comparison is the wrong tool once real
// ids are available (division names are not guaranteed unique the way ids
// are). Same "own FK OR a contact_jurisdictions ward row resolves into scope"
// union; unlike contactMatchesHierarchy's boolean return, this reports WHICH
// path(s) matched so a caller (lib/mail/recommend-recipients.ts) can label
// *why* a contact is in scope.
// --------------------------------------------------------------------------

export type JurisdictionMatchPath = "corporation_fk" | "division_fk" | "subdivision_fk" | "ward_jurisdiction";

export interface ComplaintJurisdictionScope {
  corporationId: string | null;
  divisionId: string | null;
  engSubdivisionId: string | null;
}

/**
 * Every path by which `contact` falls within `scope` — empty means out of
 * scope. A contact can match more than one path at once (e.g. its own
 * division FK AND a ward jurisdiction row); all matching paths are returned so
 * the caller can pick the most specific label rather than an arbitrary one.
 */
export function contactMatchesJurisdictionIds(
  contact: Pick<ContactWithRelations, "corporation_id" | "division_id" | "eng_subdivision_id"> & {
    jurisdictions?: JurisdictionWardNo[] | null;
  },
  scope: ComplaintJurisdictionScope,
  wardIndex: WardHierarchyIndex,
): JurisdictionMatchPath[] {
  const jur = contact.jurisdictions ?? [];
  const paths: JurisdictionMatchPath[] = [];

  if (scope.corporationId && contact.corporation_id === scope.corporationId) paths.push("corporation_fk");
  if (scope.divisionId && contact.division_id === scope.divisionId) paths.push("division_fk");
  if (scope.engSubdivisionId && contact.eng_subdivision_id === scope.engSubdivisionId) paths.push("subdivision_fk");

  const viaWard = jur.some((j) => {
    if (j.ward_no == null) return false;
    const entry = wardIndex.get(j.ward_no);
    if (!entry) return false;
    return (
      (!!scope.divisionId && entry.divisionId === scope.divisionId) ||
      (!!scope.engSubdivisionId && entry.subDivisionId === scope.engSubdivisionId)
    );
  });
  if (viaWard) paths.push("ward_jurisdiction");

  return paths;
}
