/**
 * Complaint Recipient Role Registry (declarative — the single source of truth
 * for who a complaint letter can be copied to). This is the standard BBMP
 * officer hierarchy, NOT a hardcoded list of specific people: a Copy-To lists
 * role titles, enriched with a real officer's name only when one is on record
 * for the complaint's jurisdiction (see lib/distribution/resolve-recipients.ts).
 *
 * Adding a future role (Deputy / Additional / Joint Commissioner, Chief Accounts
 * Officer, Additional Chief Engineer, Superintending Engineer, …) is a one-entry
 * data change here — no business-logic, resolver, or UI edit (Open/Closed).
 */

export type RecipientRoleKey =
  | "zonal_commissioner"
  | "zonal_chief_engineer"
  | "deputy_controller_finance"
  | "executive_engineer"
  | "assistant_executive_engineer"
  | "chief_commissioner_gba"
  | "principal_secretary_udd"
  | "chief_secretary"
  | "minister_incharge_gba"
  | "chief_minister"
  | "lokayukta"
  | "deputy_lokayukta"
  | "acb_director";

/** Which jurisdiction FK on the complaint scopes the officer lookup. There is no
 *  zone entity in the schema — corporation is the de-facto zone tier. "state" is
 *  a fixed office (GBA / State Government / statutory body) with no per-complaint
 *  jurisdiction — resolved globally by designation from the contact directory. */
export type RecipientJurisdiction = "zone" | "division" | "subdivision" | "state";

/** Display grouping for the recipient checklist (UI only; not a resolution rule). */
export type RecipientRoleGroup =
  | "BBMP Zone & Division Officers"
  | "GBA & State Government"
  | "Statutory / Oversight Bodies";

/** Group render order in the selector. */
export const RECIPIENT_ROLE_GROUP_ORDER: RecipientRoleGroup[] = [
  "BBMP Zone & Division Officers",
  "GBA & State Government",
  "Statutory / Oversight Bodies",
];

export interface RecipientRoleDescriptor {
  key: RecipientRoleKey;
  title: string; // "Executive Engineer"
  level: string; // "Division Level" (shown after the title in Copy-To)
  group: RecipientRoleGroup;
  jurisdiction: RecipientJurisdiction;
  /** designation strings that identify an officer for this role (best-effort enrichment). */
  matchDesignations: string[];
  /** contacts.role_level codes that identify an officer for this role (best-effort enrichment). */
  matchRoleLevels: string[];
  /** included in the mandatory Office Copy distribution list. */
  officeCopy: boolean;
  /** When true, this officer sits in one of the 5 GBA city-corporation offices,
   *  so the filing UI asks which corporation to address the copy to and stamps
   *  that office's postal address (from the GBA address sheet) onto the Copy-To. */
  corporationAddressed?: boolean;
  order: number; // canonical display order
}

export const COMPLAINT_RECIPIENT_ROLES: RecipientRoleDescriptor[] = [
  // ── BBMP zone & division officers — the mandatory internal Office Copy set.
  //    Every one sits in a GBA city-corporation office (corporationAddressed),
  //    so the filing UI asks which of the 5 corporations to address the copy to
  //    and stamps that office's postal address onto the Copy-To. ──
  { key: "zonal_commissioner", title: "Zonal Commissioner", level: "Zone Level", group: "BBMP Zone & Division Officers", jurisdiction: "zone", matchDesignations: ["Zonal Commissioner", "Commissioner"], matchRoleLevels: ["Commissioner", "Special Commissioner"], officeCopy: true, corporationAddressed: true, order: 1 },
  { key: "zonal_chief_engineer", title: "Zonal Chief Engineer", level: "Zone Level", group: "BBMP Zone & Division Officers", jurisdiction: "zone", matchDesignations: ["Chief Engineer"], matchRoleLevels: ["CE"], officeCopy: true, corporationAddressed: true, order: 2 },
  { key: "deputy_controller_finance", title: "Deputy Controller (Finance)", level: "Zone Level", group: "BBMP Zone & Division Officers", jurisdiction: "state", matchDesignations: ["Deputy Controller (Finance)", "Deputy Controller"], matchRoleLevels: [], officeCopy: true, corporationAddressed: true, order: 3 },
  { key: "executive_engineer", title: "Executive Engineer", level: "Division Level", group: "BBMP Zone & Division Officers", jurisdiction: "division", matchDesignations: ["Executive Engineer"], matchRoleLevels: ["EE"], officeCopy: true, corporationAddressed: true, order: 4 },
  { key: "assistant_executive_engineer", title: "Assistant Executive Engineer", level: "Sub-Division Level", group: "BBMP Zone & Division Officers", jurisdiction: "subdivision", matchDesignations: ["Assistant Executive Engineer"], matchRoleLevels: ["AEE"], officeCopy: true, corporationAddressed: true, order: 5 },
  // ── Escalation-ladder authorities (GBA / State Government / statutory bodies).
  //    Fixed offices, resolved globally by designation from the contact directory
  //    (the incumbent's name/address when one is on record; title-only otherwise).
  //    NOT part of the mandatory internal Office Copy — selectable Copy-To only. ──
  { key: "chief_commissioner_gba", title: "The Chief Commissioner", level: "Greater Bengaluru Authority (GBA)", group: "GBA & State Government", jurisdiction: "state", matchDesignations: ["Chief Commissioner"], matchRoleLevels: [], officeCopy: false, order: 6 },
  { key: "principal_secretary_udd", title: "The Principal Secretary", level: "Urban Development Department, Government of Karnataka", group: "GBA & State Government", jurisdiction: "state", matchDesignations: ["Principal Secretary"], matchRoleLevels: [], officeCopy: false, order: 7 },
  { key: "chief_secretary", title: "The Chief Secretary", level: "Government of Karnataka", group: "GBA & State Government", jurisdiction: "state", matchDesignations: ["Chief Secretary"], matchRoleLevels: [], officeCopy: false, order: 8 },
  { key: "minister_incharge_gba", title: "The Minister in-charge", level: "GBA & BWSSB, Government of Karnataka", group: "GBA & State Government", jurisdiction: "state", matchDesignations: ["Minister in-charge"], matchRoleLevels: [], officeCopy: false, order: 9 },
  { key: "chief_minister", title: "The Chief Minister", level: "Government of Karnataka (Chairman, GBA), Room No. 323A, 3rd Floor, Vidhana Soudha, Dr. Ambedkar Veedhi, Bengaluru, Karnataka - 560001", group: "GBA & State Government", jurisdiction: "state", matchDesignations: ["Chief Minister"], matchRoleLevels: [], officeCopy: false, order: 10 },
  { key: "lokayukta", title: "The Honorable Lokayukta", level: "Karnataka Lokayukta, M.S. Building, Dr. B.R. Ambedkar Road (Ambedkar Veedhi), Bengaluru - 560001 (Near Vidhana Soudha)", group: "Statutory / Oversight Bodies", jurisdiction: "state", matchDesignations: ["Lokayukta"], matchRoleLevels: [], officeCopy: false, order: 11 },
  { key: "deputy_lokayukta", title: "The Deputy Lokayukta", level: "Karnataka Lokayukta, M.S. Building, Dr. B.R. Ambedkar Road (Ambedkar Veedhi), Bengaluru - 560001 (Near Vidhana Soudha)", group: "Statutory / Oversight Bodies", jurisdiction: "state", matchDesignations: ["Deputy Lokayukta"], matchRoleLevels: [], officeCopy: false, order: 12 },
  { key: "acb_director", title: "The Director / ADGP", level: "Anti-Corruption Bureau (ACB), Karnataka", group: "Statutory / Oversight Bodies", jurisdiction: "state", matchDesignations: ["Director / ADGP"], matchRoleLevels: [], officeCopy: false, order: 13 },
];

const BY_KEY = new Map(COMPLAINT_RECIPIENT_ROLES.map((r) => [r.key, r]));

export function roleByKey(key: string): RecipientRoleDescriptor | undefined {
  return BY_KEY.get(key as RecipientRoleKey);
}

export function isRecipientRoleKey(key: string): key is RecipientRoleKey {
  return BY_KEY.has(key as RecipientRoleKey);
}

/** The keys of every role in the mandatory internal Office Copy distribution. */
export function officeCopyRoleKeys(): RecipientRoleKey[] {
  return COMPLAINT_RECIPIENT_ROLES.filter((r) => r.officeCopy).map((r) => r.key);
}

/** The keys of the zonal officers whose Copy-To address is a GBA city-corporation
 *  office (chosen once per letter from the 5 corporations). Excludes the
 *  fixed-address Deputy Controller (Finance). */
export function corporationAddressedRoleKeys(): RecipientRoleKey[] {
  return COMPLAINT_RECIPIENT_ROLES.filter((r) => r.corporationAddressed).map((r) => r.key);
}

/** "Bengaluru South" (corporations.name) -> "Bengaluru South City Corporation"
 *  (the form used in outgoing correspondence). Idempotent if already suffixed.
 *  Framework-free (no "server-only") so both the server-side resolver
 *  (lib/distribution/resolve-recipients.ts) and the client-side live preview
 *  (RecipientSelector, via case-workflow.tsx) can render the Commissioner's
 *  zone/corporation office identically. */
export function corporationOfficeName(corpName: string): string {
  const name = corpName.trim();
  return /city corporation$/i.test(name) ? name : `${name} City Corporation`;
}
