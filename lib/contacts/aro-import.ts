/**
 * ARO directory → Contact + jurisdiction transform (PURE, framework-free,
 * unit-tested). Turns one parsed ARO officer (from the BBMP ARO Details PDF,
 * data/aro-directory.json) into a contacts insert row + its ward-jurisdiction
 * rows, following the "one officer, many wards" model. No AI, no DB — the
 * importer script (scripts/import-aro-directory.ts) resolves ward ids and writes.
 */
import { OFFICIAL_TITLES, type OfficialTitle } from "@/lib/constants";

export interface AroWard {
  wardNo: number;
  wardName: string;
}
export interface AroOfficer {
  zone: string | null;
  aroOfficeDivision: string | null;
  officer: string;
  mobile: string;
  email: string;
  address: string | null;
  wards: AroWard[];
}

const clean = (s: unknown) => (s == null ? "" : String(s)).replace(/\s+/g, " ").trim();

/** Title-case one token, keeping short all-caps initials (e.g. "K", "N.G") upper. */
function tcToken(tok: string): string {
  if (!tok) return tok;
  if (tok.includes(".")) {
    return tok.split(".").map((p) => (p.length <= 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())).join(".");
  }
  if (tok.length <= 2 && tok === tok.toUpperCase()) return tok.toUpperCase(); // initials like "K", "MV"
  return tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase();
}

const TITLE_MAP: Record<string, OfficialTitle> = {
  sri: "Sri", shri: "Sri", smt: "Smt", kum: "Kum", mr: "Mr", mrs: "Mrs", ms: "Ms", dr: "Dr", er: "Er",
};

/** Split a raw officer name into an honorific title (if any) + a title-cased name. */
export function parseOfficerName(raw: string): { title: OfficialTitle | null; name: string } {
  let s = clean(raw).replace(/\s*\.\s*/g, "."); // normalize spaced dots ("Venkatappa . D" -> "Venkatappa.D")
  let title: OfficialTitle | null = null;
  const m = s.match(/^(sri|shri|smt|kum|mrs|mr|ms|dr|er)\.?\s*/i);
  if (m) {
    title = TITLE_MAP[m[1]!.toLowerCase()] ?? null;
    s = s.slice(m[0].length);
  }
  const name = s
    .split(/\s+/)
    .flatMap((w) => w.split(/(?<=\.)(?=[A-Za-z])/)) // "Jyothilakshmi.S" stays one token; keep as-is
    .map(tcToken)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return { title, name: name || clean(raw) };
}

export function normalizeEmail(raw: string): string | null {
  const e = clean(raw).replace(/\s+/g, "").toLowerCase();
  return e && e.includes("@") ? e : null;
}
export function normalizePhone(raw: string): string | null {
  const d = clean(raw).replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d || null;
}

/** A contacts insert row (snake_case) — minus server-managed ids/audit cols. */
export interface AroContactRow {
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

const SOURCE = "Official BBMP ARO Directory PDF";
const IMPORTED_FROM = "BBMP Official ARO Directory (AroDetails.pdf)";

export function aroOfficerToContactRow(o: AroOfficer): AroContactRow {
  const { title, name } = parseOfficerName(o.officer);
  const phone = normalizePhone(o.mobile);
  const division = clean(o.aroOfficeDivision);
  const officeName = division ? `BBMP ARO Office, ${division.split(" ").map(tcToken).join(" ")}` : "BBMP ARO Office";
  const wardsList = o.wards.map((w) => `${w.wardNo} - ${clean(w.wardName)}`).join("; ");
  return {
    full_name: name,
    official_title: title,
    designation: "Assistant Revenue Officer",
    department: "Revenue Department",
    designation_category: "Revenue",
    office_type: "ARO Office",
    office_name: officeName,
    office_address: clean(o.address) || null,
    phone,
    whatsapp: phone, // spec: WhatsApp = Phone when no separate WhatsApp exists
    email: normalizeEmail(o.email),
    zone: clean(o.zone) || null,
    letter_salutation: "Respected Sir / Madam",
    officer_status: "Active",
    can_receive_complaint: true,
    can_receive_rti: true,
    can_receive_appeal: true,
    can_receive_legal_notice: true,
    can_receive_tvcc_notice: false,
    verification_status: "PENDING",
    confidence_score: "LOW",
    source: SOURCE,
    imported_from: IMPORTED_FROM,
    jurisdiction_notes: wardsList ? `Handles wards: ${wardsList}` : null,
    public_notes: "Official Assistant Revenue Officer for the above ward(s).",
    internal_notes: "Imported automatically from BBMP Official ARO Directory.",
  };
}

export interface AroJurisdictionRow {
  ward_no: number;
  ward_name: string;
  zone: string | null;
  aro_office_division: string | null;
  jurisdiction_type: "ward";
  is_primary: boolean;
}

export function aroOfficerToJurisdictions(o: AroOfficer): AroJurisdictionRow[] {
  return o.wards.map((w, i) => ({
    ward_no: w.wardNo,
    ward_name: clean(w.wardName),
    zone: clean(o.zone) || null,
    aro_office_division: clean(o.aroOfficeDivision) || null,
    jurisdiction_type: "ward",
    is_primary: i === 0,
  }));
}

/** Dedup key: an ARO officer is identified by their (10-digit) mobile. */
export function officerDedupeKey(o: AroOfficer): string | null {
  return normalizePhone(o.mobile);
}

export { OFFICIAL_TITLES };
