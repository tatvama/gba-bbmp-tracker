/**
 * GBA senior-authority directory → Contact insert rows (PURE, framework-free,
 * unit-tested). A small, hand-curated set of the top statutory / political /
 * administrative recipients a BBMP escalation or legal notice is addressed to
 * (Chief Commissioner GBA, Minister in-charge, Chief Minister, UDD Principal
 * Secretary, Lokayukta, ACB). These are cross-cutting — no ward / sub-division
 * jurisdiction — so they carry no contact_jurisdictions rows.
 *
 * No AI, no DB: the importer (scripts/import-gba-authorities.ts) writes these.
 */
import type {
  DesignationCategory,
  OfficeType,
  OfficialTitle,
} from "@/lib/constants";

export interface GbaAuthority {
  officialTitle: OfficialTitle | null;
  fullName: string;
  designation: string;
  department: string;
  designationCategory: DesignationCategory;
  officeType: OfficeType;
  officeName: string | null;
  officeAddress: string;
  letterSalutation: string;
  /** Overrides on the workflow defaults below (complaint/appeal/legal on). */
  canReceive?: Partial<
    Record<"complaint" | "rti" | "appeal" | "legalNotice" | "tvccNotice", boolean>
  >;
  publicNotes?: string;
}

/**
 * The authorities, transcribed faithfully from the user-supplied GBA
 * senior-authority list. Incumbents (Commissioner / Minister / CM) rotate — the
 * importer marks these PENDING so they are verified before official use.
 */
export const GBA_AUTHORITIES: GbaAuthority[] = [
  {
    officialTitle: null,
    fullName: "M. Maheshwara Rao, IAS",
    designation: "Chief Commissioner",
    department: "Greater Bengaluru Authority (GBA)",
    designationCategory: "Administration",
    officeType: "Head Office",
    officeName: "Office of the Chief Commissioner, GBA",
    officeAddress:
      "Kempegowda Civic Hall, Hudson Circle (Corporation Circle), Bengaluru – 560002",
    letterSalutation: "Respected Sir",
    canReceive: { rti: true, tvccNotice: true },
    publicNotes: "Chief Commissioner, Greater Bengaluru Authority (GBA).",
  },
  {
    officialTitle: "Sri",
    fullName: "Krishna Byre Gowda",
    designation: "Minister in-charge",
    department: "Greater Bengaluru Authority (GBA) & BWSSB",
    designationCategory: "Administration",
    officeType: "Head Office",
    officeName: "Minister in-charge of Greater Bengaluru Authority (GBA) & BWSSB",
    officeAddress: "Vidhana Soudha, Dr. Ambedkar Veedhi, Bengaluru – 560001",
    letterSalutation: "Respected Sir",
    publicNotes: "Minister in-charge of Greater Bengaluru Authority (GBA) & BWSSB.",
  },
  {
    officialTitle: "Sri",
    fullName: "D.K. Shivakumar",
    designation: "Chief Minister",
    department: "Government of Karnataka",
    designationCategory: "Administration",
    officeType: "Head Office",
    officeName: "Chief Minister of Karnataka (Chairman, GBA)",
    officeAddress: "Vidhana Soudha, Dr. Ambedkar Veedhi, Bengaluru – 560001",
    letterSalutation: "Respected Sir",
    publicNotes:
      "Chief Minister of Karnataka; Chairman of the Greater Bengaluru Authority (GBA), with direct charge of BDA/BMRDA.",
  },
  {
    officialTitle: null,
    fullName: "Urban Development Department (BBMP-2 & Coordination)",
    designation: "Principal Secretary",
    department: "Urban Development Department",
    designationCategory: "Administration",
    officeType: "Head Office",
    officeName: "BBMP-2 and Coordination Wing, Secretariat",
    officeAddress: "Vikasa Soudha, Dr. Ambedkar Veedhi, Bengaluru – 560001",
    letterSalutation: "Respected Sir / Madam",
    canReceive: { rti: true },
    publicNotes:
      "Secretariat-level office for RTI and complaint escalation (BBMP-2 and Coordination).",
  },
  {
    officialTitle: "Justice",
    fullName: "B.S. Patil",
    designation: "Lokayukta",
    department: "Karnataka Lokayukta",
    designationCategory: "Legal",
    officeType: "Head Office",
    officeName: "Karnataka Lokayukta",
    officeAddress:
      "Multi-Storeyed Building, Dr. B.R. Ambedkar Veedhi, Bengaluru – 560001",
    letterSalutation: "Hon'ble Sir",
    canReceive: { appeal: false, tvccNotice: true },
    publicNotes: "Lokayukta of Karnataka.",
  },
  {
    officialTitle: null,
    fullName: "Anti-Corruption Bureau (ACB), Karnataka",
    designation: "Director / ADGP",
    department: "Anti-Corruption Bureau (ACB)",
    designationCategory: "Legal",
    officeType: "Head Office",
    officeName: "Anti-Corruption Bureau, Karnataka",
    officeAddress:
      "No. 49, Khanija Bhavan, Race Course Road, Bengaluru – 560001",
    letterSalutation: "Respected Sir",
    canReceive: { appeal: false, tvccNotice: true },
    publicNotes: "The Director / ADGP, Anti-Corruption Bureau (ACB), Karnataka.",
  },
];

/** A contacts insert row (snake_case), matching the ARO importer's column set. */
export interface AuthorityContactRow {
  full_name: string;
  official_title: string | null;
  designation: string;
  department: string;
  designation_category: string;
  office_type: string;
  office_name: string | null;
  office_address: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  zone: string | null;
  letter_salutation: string;
  officer_status: string;
  can_receive_complaint: boolean;
  can_receive_rti: boolean;
  can_receive_appeal: boolean;
  can_receive_legal_notice: boolean;
  can_receive_tvcc_notice: boolean;
  verification_status: string;
  confidence_score: string;
  source: string;
  imported_from: string;
  jurisdiction_notes: string | null;
  public_notes: string;
  internal_notes: string;
}

export const GBA_AUTHORITY_SOURCE = "GBA Senior Authority Directory";
const IMPORTED_FROM = "GBA senior-authority recipient list (manual)";

export function authorityToContactRow(a: GbaAuthority): AuthorityContactRow {
  const r = a.canReceive ?? {};
  return {
    full_name: a.fullName,
    official_title: a.officialTitle,
    designation: a.designation,
    department: a.department,
    designation_category: a.designationCategory,
    office_type: a.officeType,
    office_name: a.officeName,
    office_address: a.officeAddress || null,
    phone: null,
    whatsapp: null,
    email: null,
    zone: null,
    letter_salutation: a.letterSalutation,
    officer_status: "Active",
    // These are escalation / oversight recipients: complaint, appeal and legal
    // notice on by default; RTI + TVCC opt-in per authority.
    can_receive_complaint: r.complaint ?? true,
    can_receive_rti: r.rti ?? false,
    can_receive_appeal: r.appeal ?? true,
    can_receive_legal_notice: r.legalNotice ?? true,
    can_receive_tvcc_notice: r.tvccNotice ?? false,
    // High confidence in the transcribed data, but incumbents rotate — leave
    // PENDING so a human confirms the current holder before official use.
    verification_status: "PENDING",
    confidence_score: "HIGH",
    source: GBA_AUTHORITY_SOURCE,
    imported_from: IMPORTED_FROM,
    jurisdiction_notes: null,
    public_notes: a.publicNotes ?? "",
    internal_notes: "Added from the GBA senior-authority recipient list.",
  };
}

/** Dedup key: an authority is identified by its full_name (case-insensitive). */
export function authorityDedupeKey(a: GbaAuthority): string {
  return a.fullName.replace(/\s+/g, " ").trim().toLowerCase();
}
