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
  | "accounts_officer"
  | "executive_engineer"
  | "assistant_executive_engineer";

/** Which jurisdiction FK on the complaint scopes the officer lookup. There is no
 *  zone entity in the schema — corporation is the de-facto zone tier. */
export type RecipientJurisdiction = "zone" | "division" | "subdivision";

export interface RecipientRoleDescriptor {
  key: RecipientRoleKey;
  title: string; // "Executive Engineer"
  level: string; // "Division Level" (shown after the title in Copy-To)
  jurisdiction: RecipientJurisdiction;
  /** designation strings that identify an officer for this role (best-effort enrichment). */
  matchDesignations: string[];
  /** contacts.role_level codes that identify an officer for this role (best-effort enrichment). */
  matchRoleLevels: string[];
  /** included in the mandatory Office Copy distribution list. */
  officeCopy: boolean;
  order: number; // canonical display order
}

export const COMPLAINT_RECIPIENT_ROLES: RecipientRoleDescriptor[] = [
  { key: "zonal_commissioner", title: "Zonal Commissioner", level: "Zone Level", jurisdiction: "zone", matchDesignations: ["Zonal Commissioner", "Commissioner"], matchRoleLevels: ["Commissioner", "Special Commissioner"], officeCopy: true, order: 1 },
  { key: "zonal_chief_engineer", title: "Zonal Chief Engineer", level: "Zone Level", jurisdiction: "zone", matchDesignations: ["Chief Engineer"], matchRoleLevels: ["CE"], officeCopy: true, order: 2 },
  { key: "accounts_officer", title: "Accounts Officer", level: "Division Level", jurisdiction: "division", matchDesignations: ["Accounts Officer", "Chief Accounts Officer"], matchRoleLevels: ["AO"], officeCopy: true, order: 3 },
  { key: "executive_engineer", title: "Executive Engineer", level: "Division Level", jurisdiction: "division", matchDesignations: ["Executive Engineer"], matchRoleLevels: ["EE"], officeCopy: true, order: 4 },
  { key: "assistant_executive_engineer", title: "Assistant Executive Engineer", level: "Sub-Division Level", jurisdiction: "subdivision", matchDesignations: ["Assistant Executive Engineer"], matchRoleLevels: ["AEE"], officeCopy: true, order: 5 },
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
