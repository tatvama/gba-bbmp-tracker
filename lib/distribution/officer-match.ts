/**
 * Match a fixed-office recipient role (Lokayukta, Chief Commissioner, Chief
 * Minister, …) to a real officer from the contact directory by designation
 * (PURE, framework-free, unit-tested). Used by the server resolver to enrich a
 * "state"-jurisdiction Copy-To role with the incumbent's name/address when one
 * is on record; returns null (title-only) otherwise. No DB, no AI.
 */
export interface OfficerMatchRow {
  full_name: string | null;
  designation: string | null;
  office_name?: string | null;
  office_address: string | null;
  officer_status?: string | null;
}

export interface OfficerEnrichment {
  name: string | null;
  office: string | null;
  address: string | null;
}

/**
 * First contact whose designation is in `matchDesignations` (case-insensitive),
 * preferring an Active officer. `office` is left null so the Copy-To line stays
 * clean (the role's own `level` carries the office context); the postal address
 * rides along for the persisted recipient snapshot.
 */
export function matchOfficerByDesignation(
  contacts: OfficerMatchRow[],
  matchDesignations: string[],
): OfficerEnrichment | null {
  if (!matchDesignations.length) return null;
  const wanted = new Set(matchDesignations.map((d) => d.trim().toLowerCase()));
  const hits = contacts.filter((c) => c.designation && wanted.has(c.designation.trim().toLowerCase()));
  if (!hits.length) return null;
  const best = hits.find((c) => (c.officer_status ?? "").toLowerCase() === "active") ?? hits[0]!;
  return { name: best.full_name ?? null, office: null, address: best.office_address ?? null };
}
