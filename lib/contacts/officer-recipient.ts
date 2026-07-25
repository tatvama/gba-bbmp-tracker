/**
 * Officer → letter-recipient shaping (PURE, framework-free, unit-tested).
 *
 * The AI drafting flows should be able to address a letter given only a ward (or
 * complaint / RTI) — the system resolves the responsible official from the
 * Contact directory and this module turns that contact (+ its ward jurisdiction)
 * into a ready-to-print recipient block, salutation and postal address. No field
 * is invented: everything comes from the stored contact / jurisdiction.
 */
import type { Contact, ContactJurisdiction } from "@/lib/types";

export interface OfficerRecipient {
  /** Display name incl. honorific, e.g. "Sri Nataraj". */
  name: string;
  designation: string | null;
  officeName: string | null;
  address: string | null;
  ward: string | null; // "52 - K.R.Puram"
  zone: string | null;
  phone: string | null;
  email: string | null;
  /** "Respected Sir / Madam" (stored letter_salutation, else a safe default). */
  salutation: string;
  /** Multi-line TO block, ready to print at the top of a letter. */
  postalBlock: string[];
}

const clean = (s: unknown): string => (s == null ? "" : String(s)).trim();

/** "Sri" + "Nataraj" → "Sri Nataraj"; no honorific → just the name.
 *  Takes a loose shape rather than Pick<Contact, …> so callers holding a partial
 *  row (e.g. lib/mail/recipients.ts's narrowed select) can use it without
 *  re-deriving the constrained OFFICIAL_TITLES / DESIGNATIONS unions. */
export function officerDisplayName(contact: { official_title?: string | null; full_name?: string | null }): string {
  const title = clean(contact.official_title);
  const name = clean(contact.full_name);
  return title ? `${title} ${name}`.trim() : name;
}

/** "52 - K.R.Puram" from a jurisdiction row (number and/or name). */
export function wardLabel(jur: Pick<ContactJurisdiction, "ward_no" | "ward_name"> | null | undefined): string | null {
  if (!jur) return null;
  const no = jur.ward_no != null ? String(jur.ward_no) : "";
  const name = clean(jur.ward_name);
  if (no && name) return `${no} - ${name}`;
  return no || name || null;
}

export function buildOfficerRecipient(
  contact: Contact,
  jur?: ContactJurisdiction | null,
): OfficerRecipient {
  const name = officerDisplayName(contact);
  const designation = clean(contact.designation) || null;
  const officeName = clean(contact.office_name) || null;
  const address = clean(contact.office_address) || null;
  const ward = wardLabel(jur);
  const zone = clean(jur?.zone) || clean(contact.zone) || null;
  const salutation = clean(contact.letter_salutation) || "Respected Sir / Madam";

  const wardZone = [ward ? `Ward ${ward}` : "", zone ? `${zone} Zone` : ""].filter(Boolean).join(", ");
  const postalBlock = [
    designation ? `The ${designation}` : "",
    name,
    officeName,
    address,
    wardZone,
    "Bruhat Bengaluru Mahanagara Palike (BBMP)",
  ]
    .map(clean)
    .filter(Boolean);

  return {
    name,
    designation,
    officeName,
    address,
    ward,
    zone,
    phone: clean(contact.phone) || null,
    email: clean(contact.email) || null,
    salutation,
    postalBlock,
  };
}
