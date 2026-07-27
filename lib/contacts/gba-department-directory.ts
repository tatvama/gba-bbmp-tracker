/**
 * Department/zone directory → Contact insert/update plan (PURE, framework-free,
 * unit-tested) — the gba-authorities.ts sibling for the much larger department,
 * corporation, zone and oversight directory extracted this session.
 *
 * Reads TWO data sources directly (resolveJsonModule is enabled repo-wide):
 *  - data/gba-department-directory.json — official-source-cited, confidence HIGH.
 *  - data/bbmp-officer-directory-addendum.json — user-supplied, confidence MEDIUM,
 *    kept separate because the two sometimes disagree (see its own "about" field).
 *
 * The user was explicit that this must never create a duplicate contact for an
 * official already in the system — so this module never returns a bare INSERT
 * for anything that identifiably overlaps an existing GBA_AUTHORITIES row
 * (lib/contacts/gba-authorities.ts) or an official department/zone email the
 * addendum itself flags as a near-duplicate or a conflict. Those become
 * `updates` (enrich in place) or `needsReview` (both values kept, nothing
 * decided in code) instead.
 *
 * No DB access here — lib/contacts/gba-department-directory-queries.ts and
 * scripts/import-gba-department-directory.ts execute the plan this module
 * produces (resolving corporation codes to ids, matching existing rows).
 */
import officialData from "@/data/gba-department-directory.json";
import addendumData from "@/data/bbmp-officer-directory-addendum.json";
import { GBA_AUTHORITY_SOURCE } from "./gba-authorities";

export const GBA_DEPARTMENT_DIRECTORY_SOURCE = "GBA Department Directory";
export const GBA_DEPARTMENT_DIRECTORY_ADDENDUM_SOURCE = "BBMP Officer Directory (user-supplied, 2026-07-25)";

/** A contacts insert row (snake_case) — the same shape gba-authorities.ts's
 *  AuthorityContactRow uses, widened with a corporation code the import script
 *  resolves to corporation_id (this module has no DB access, so it cannot
 *  resolve that itself). */
export interface DeptContactRow {
  full_name: string;
  official_title: string | null;
  designation: string;
  department: string | null;
  designation_category: string;
  office_type: string;
  office_name: string | null;
  office_address: string | null;
  phone: string | null;
  email: string | null;
  /** Resolved to contacts.corporation_id by the import script via
   *  corporations.code — null when the zone straddles more than one
   *  corporation (left null rather than guessed, same as the ARO pattern). */
  corporation_code: string | null;
  officer_status: string;
  verification_status: string;
  confidence_score: string;
  source: string;
  imported_from: string;
  public_notes: string;
  internal_notes: string;
}

/** Enrich an EXISTING contact in place — never a new row. */
export interface DeptUpdate {
  /** How the import script finds the row to update — by (source, designation)
   *  identity for the GBA_AUTHORITIES overlaps, or by an exact existing email
   *  for a near-duplicate/conflict annotation. */
  matchBy: { source: string; designation: string } | { email: string };
  patch: Partial<Pick<DeptContactRow, "email" | "office_name" | "office_address" | "phone" | "verification_status" | "internal_notes">>;
  reason: string;
}

/** Retire (not delete) an existing contact — the row stays as a historical
 *  record but stops being a live match for postal/email resolution. */
export interface DeptDeactivation {
  matchBy: { source: string; designation: string };
  reason: string;
}

/** Something the import script must NOT resolve silently — surfaced in the
 *  dry-run's "needs manual review" bucket, both values preserved. */
export interface DeptReviewItem {
  email: string;
  description: string;
  detail: string;
}

export interface DepartmentDirectoryPlan {
  inserts: DeptContactRow[];
  updates: DeptUpdate[];
  deactivations: DeptDeactivation[];
  needsReview: DeptReviewItem[];
}

// ── Loose shapes for the two JSON files' entries — plain strings straight out
//    of hand-authored JSON, not the constrained unions the contact FORM uses.
interface OfficialDeptEntry {
  department: string;
  designation: string;
  officerName: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  officeName: string | null;
  address: string | null;
  notes: string | null;
}
interface OfficialCorpEntry {
  corporation: string;
  code: string;
  designation: string;
  officerName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
}
interface OfficialZoneEntry {
  zone: string;
  designation: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  nowPartOf: string;
}
interface OfficialOversightEntry {
  office: string;
  designation: string;
  officerName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
}
interface AddendumEntry {
  email: string;
  designation: string;
  department: string;
  designationCategory: string;
  officeType: string;
  officeName: string | null;
  officeAddress: string | null;
  phone: string | null;
  corporationCode: string | null;
  notes?: string | null;
  reconciliation?: { type: "near_duplicate" | "conflict"; of: string | null; note: string };
}

const official = officialData as unknown as {
  departments: OfficialDeptEntry[];
  corporations: OfficialCorpEntry[];
  zonalOffices: OfficialZoneEntry[];
  oversight: OfficialOversightEntry[];
};
const addendum = addendumData as unknown as { entries: AddendumEntry[] };

const IMPORTED_FROM = "GBA department/zone directory import (data/gba-department-directory.json + addendum)";

function baseRow(over: Partial<DeptContactRow> & Pick<DeptContactRow, "full_name" | "designation">): DeptContactRow {
  return {
    official_title: null,
    department: null,
    designation_category: "Other",
    office_type: "Head Office",
    office_name: null,
    office_address: null,
    phone: null,
    email: null,
    corporation_code: null,
    officer_status: "Active",
    verification_status: "PENDING",
    confidence_score: "HIGH",
    source: GBA_DEPARTMENT_DIRECTORY_SOURCE,
    imported_from: IMPORTED_FROM,
    public_notes: "",
    internal_notes: "",
    ...over,
  };
}

/**
 * The 6 posts already present as GBA_AUTHORITIES contacts (lib/contacts/
 * gba-authorities.ts), matched by DESIGNATION rather than name — the two
 * sources transcribe the same person's name differently (e.g. "M. Maheshwara
 * Rao, IAS" vs "Sri. Maheshwar Rao M, IAS"), so name matching would miss them
 * and silently create a duplicate, which is exactly what the user does not want.
 */
const AUTHORITY_OVERLAP_DESIGNATIONS = [
  "Chief Commissioner",
  "Minister in-charge",
  "Chief Minister",
  "Principal Secretary", // superseded — see the ACS/Secretary split below
  "Lokayukta",
  "Director / ADGP", // superseded — the ACB was abolished, see below
] as const;

export function buildDepartmentDirectoryPlan(): DepartmentDirectoryPlan {
  const inserts: DeptContactRow[] = [];
  const updates: DeptUpdate[] = [];
  const deactivations: DeptDeactivation[] = [];
  const needsReview: DeptReviewItem[] = [];

  // ── 1. The 6 known GBA_AUTHORITIES overlaps — enrich in place ────────────
  const chiefCommissioner = official.departments.find((d) => /Chief Commissioner/.test(d.designation));
  if (chiefCommissioner?.email) {
    updates.push({
      matchBy: { source: GBA_AUTHORITY_SOURCE, designation: "Chief Commissioner" },
      patch: { email: chiefCommissioner.email, office_name: chiefCommissioner.officeName, office_address: chiefCommissioner.address, phone: chiefCommissioner.phone },
      reason: "Enrich with the official Chief Commissioner email/office (data/gba-department-directory.json).",
    });
  }

  const minister = official.oversight.find((o) => /Minister in-charge/i.test(o.designation));
  if (minister) {
    updates.push({
      matchBy: { source: GBA_AUTHORITY_SOURCE, designation: "Minister in-charge" },
      patch: { office_address: minister.address, phone: minister.phone },
      reason: "Enrich with the official Minister in-charge (GBA/BWSSB) office details. No official-domain email was found for this post.",
    });
  }

  const cm = official.oversight.find((o) => /Chief Minister/i.test(o.designation));
  if (cm?.email) {
    updates.push({
      matchBy: { source: GBA_AUTHORITY_SOURCE, designation: "Chief Minister" },
      patch: { email: cm.email, office_address: cm.address, phone: cm.phone },
      reason: "Enrich with the official Chief Minister's Office email/address (data/gba-department-directory.json).",
    });
  }

  const lokayukta = official.oversight.find((o) => /^Registrar, Karnataka Lokayukta/i.test(o.designation));
  if (lokayukta?.email) {
    updates.push({
      matchBy: { source: GBA_AUTHORITY_SOURCE, designation: "Lokayukta" },
      patch: { email: lokayukta.email, office_address: lokayukta.address, phone: lokayukta.phone },
      reason: "Enrich with the official Lokayukta office email/address (registrar's line — the Hon'ble Lokayukta has no personal official-domain mailbox published).",
    });
  }

  // UDD "Principal Secretary" never existed — the real hierarchy is Additional
  // Chief Secretary -> Secretary (see lib/complaints/recipient-roles.ts's fix).
  // The one existing contact becomes the ACS (senior of the two); the Secretary
  // is a genuinely new insert, since there was previously no contact for either.
  const acs = official.oversight.find((o) => /Additional Chief Secretary/i.test(o.designation));
  const secretary = official.oversight.find((o) => /^Secretary to Government, Urban Development/i.test(o.designation));
  if (acs) {
    updates.push({
      matchBy: { source: GBA_AUTHORITY_SOURCE, designation: "Principal Secretary" },
      patch: {
        email: acs.email,
        office_address: acs.address,
        phone: acs.phone,
        internal_notes: "Retitled from 'Principal Secretary' (no such UDD post exists) to Additional Chief Secretary, per the official Government of Karnataka contact directory.",
      },
      reason: "Correct the non-existent 'Principal Secretary' post to the real Additional Chief Secretary, UDD.",
    });
  }
  if (secretary?.email) {
    inserts.push(
      baseRow({
        full_name: "Secretary to Government, Urban Development Department",
        designation: "Secretary",
        department: "Urban Development Department",
        designation_category: "Administration",
        email: secretary.email,
        office_address: secretary.address,
        phone: secretary.phone,
        public_notes: "Secretary, Urban Development Department (UD & Municipalities) — the second tier of the real UDD hierarchy alongside the Additional Chief Secretary.",
      }),
    );
  }

  // The ACB was abolished in 2022; its powers reverted to the Lokayukta Police.
  // Deactivate the old contact (kept as a historical record) rather than delete
  // it, and insert the office that actually holds the jurisdiction now.
  deactivations.push({
    matchBy: { source: GBA_AUTHORITY_SOURCE, designation: "Director / ADGP" },
    reason: "The Anti-Corruption Bureau was abolished by the Karnataka High Court on 11 August 2022; its Prevention of Corruption Act powers reverted to the Karnataka Lokayukta Police. This contact has no live recipient — retained only as a historical record.",
  });
  const adgp = official.oversight.find((o) => /Additional Director General of Police/i.test(o.designation));
  if (adgp?.email) {
    inserts.push(
      baseRow({
        full_name: "Additional Director General of Police, Karnataka Lokayukta",
        designation: "Additional Director General of Police",
        department: "Karnataka Lokayukta (Police Wing)",
        designation_category: "Legal",
        email: adgp.email,
        office_address: adgp.address,
        phone: adgp.phone,
        public_notes: "The office that replaced the Anti-Corruption Bureau. The correct recipient for anti-corruption complaints against GBA/BBMP officials.",
      }),
    );
  }

  // ── 2. Remaining official `departments` — insert everyone with a name or a
  //    real office to stand in for one (contacts.full_name is NOT NULL) ─────
  for (const d of official.departments) {
    if (AUTHORITY_OVERLAP_DESIGNATIONS.some((k) => d.designation.includes(k))) continue; // handled above
    const fullName = d.officerName?.trim() || d.designation.trim();
    if (!fullName) continue;
    inserts.push(
      baseRow({
        full_name: fullName,
        designation: d.designation,
        department: d.department,
        email: d.email,
        office_name: d.officeName,
        office_address: d.address,
        phone: d.phone || d.mobile,
        confidence_score: d.email ? "HIGH" : "MEDIUM",
        public_notes: d.notes ?? "",
      }),
    );
  }

  // ── 3. The 5 corporations — Commissioners, corporation_id via `code` ──────
  for (const c of official.corporations) {
    if (!c.officerName) continue;
    inserts.push(
      baseRow({
        full_name: c.officerName,
        designation: c.designation,
        department: c.corporation,
        designation_category: "Administration",
        office_type: "Head Office",
        email: c.email,
        office_address: c.address,
        phone: c.phone,
        corporation_code: c.code,
        confidence_score: "HIGH",
      }),
    );
  }

  // ── 4. The 8 legacy zonal offices — no personal name on record, so the
  //    designation itself stands in for full_name (same pattern gba-
  //    authorities.ts already uses for the ACB office-level entry). ─────────
  const ZONE_TO_CORP: Record<string, string | null> = {
    East: null, // straddles Central/East per the official directory's own finding
    West: null, // straddles West/Central
    South: "DAKSHINA",
    Mahadevapura: "PURVA",
    Bommanahalli: "DAKSHINA",
    Yelahanka: "UTTARA",
    Dasarahalli: null, // straddles North/West
    "Rajarajeshwari Nagar": "PASHCHIMA",
  };
  for (const z of official.zonalOffices) {
    if (!z.email) continue;
    inserts.push(
      baseRow({
        full_name: `Joint Commissioner, ${z.zone} Zone`,
        designation: z.designation,
        department: `${z.zone} Zone`,
        designation_category: "Administration",
        office_type: "Zone Office",
        email: z.email,
        office_address: z.address,
        phone: z.phone,
        corporation_code: ZONE_TO_CORP[z.zone] ?? null,
        internal_notes: `Legacy BBMP zone, now part of ${z.nowPartOf}.`,
      }),
    );
  }

  // ── 5. Remaining oversight posts with no GBA_AUTHORITIES analog ──────────
  const OVERSIGHT_HANDLED = [
    "Minister in-charge",
    "Chief Minister",
    "Additional Chief Secretary",
    "Secretary to Government, Urban Development",
    "Registrar, Karnataka Lokayukta",
    "Additional Director General of Police",
    "ABOLISHED",
  ];
  for (const o of official.oversight) {
    if (OVERSIGHT_HANDLED.some((k) => o.designation.includes(k))) continue;
    if (!o.email) continue;
    inserts.push(
      baseRow({
        full_name: o.officerName?.trim() || o.designation.trim(),
        designation: o.designation,
        department: o.office,
        designation_category: "Administration",
        email: o.email,
        office_address: o.address,
        phone: o.phone,
        confidence_score: "HIGH",
      }),
    );
  }

  // ── 6. Addendum entries — insert / alternate-email / conflict, per its own
  //    per-entry `reconciliation` field. Never a bare insert for anything the
  //    addendum itself flags as overlapping an official entry. ─────────────
  for (const a of addendum.entries) {
    if (!a.reconciliation) {
      inserts.push(
        baseRow({
          full_name: a.designation.trim(),
          designation: a.designation,
          department: a.department,
          designation_category: a.designationCategory,
          office_type: a.officeType,
          email: a.email,
          office_name: a.officeName,
          office_address: a.officeAddress,
          phone: a.phone,
          corporation_code: a.corporationCode,
          source: GBA_DEPARTMENT_DIRECTORY_ADDENDUM_SOURCE,
          confidence_score: "MEDIUM",
          internal_notes: a.notes ?? "",
        }),
      );
      continue;
    }

    if (a.reconciliation.type === "near_duplicate" && a.reconciliation.of) {
      updates.push({
        matchBy: { email: a.reconciliation.of },
        patch: { internal_notes: `Also seen as: ${a.email} (${a.reconciliation.note})` },
        reason: `Near-duplicate of an existing email — recorded as an alternate, not a second contact.`,
      });
      continue;
    }

    // A genuine factual conflict — never decided in code.
    needsReview.push({
      email: a.email,
      description: `${a.designation} (${a.department})`,
      detail: a.reconciliation.note,
    });
  }

  return { inserts, updates, deactivations, needsReview };
}
