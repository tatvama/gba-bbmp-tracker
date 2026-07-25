import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveOfficerForWard } from "@/lib/contacts/resolve-officer";
import { officerDisplayName } from "@/lib/contacts/officer-recipient";
import { isValidEmail, normalizeAddressList } from "./message";

/**
 * "Which officer does this letter go to, and do we have an address for them?"
 *
 * The postal recipient and the email recipient are resolved by different paths in
 * this codebase, and that is not an oversight to be papered over:
 * lib/distribution/resolve-recipients.ts builds POSTAL blocks by statutory role
 * (Executive Engineer, Zonal Commissioner …) and never selects contacts.email,
 * while contacts.email is populated mainly for the ward officers imported from
 * the ARO directory. So this module resolves the email recipient explicitly, in
 * the same precedence the case itself uses, and reports honestly when no address
 * exists rather than inventing one.
 *
 * Precedence for the TO address:
 *   1. assigned_engineer_id  — an explicit engineering assignment wins, same rule
 *      lib/ai/complaint-draft.ts applies when choosing the letter's addressee.
 *   2. assigned_officer_id
 *   3. the ward-responsible officer from contact_jurisdictions.
 *
 * Never throws. A complaint with no emailable officer yields
 * { to: [], reason: "..." }, which the caller records as a skipped outbox row.
 */

export interface EmailRecipients {
  to: string[];
  cc: string[];
  /** The contact the TO address came from, for the outbox row and salutation. */
  officerId: string | null;
  officerName: string | null;
  officerDesignation: string | null;
  /** Populated when `to` is empty — why nobody could be written to. */
  reason: string | null;
}

const CONTACT_FIELDS = "id, full_name, official_title, designation, email, officer_status";

/**
 * The handful of contact fields this module needs, as plain strings.
 *
 * Deliberately NOT Pick<Contact, …>: Contact types `designation` and
 * `official_title` as the constrained DESIGNATIONS / OFFICIAL_TITLES unions,
 * which is right for the contact form's dropdowns but wrong here — these rows
 * come straight from Postgres, where the column is free text, and an imported
 * officer may legitimately carry a designation that predates the union.
 */
export interface ContactLite {
  id: string;
  full_name: string | null;
  official_title: string | null;
  designation: string | null;
  email: string | null;
  officer_status: string | null;
}

const EMPTY = (reason: string): EmailRecipients => ({
  to: [],
  cc: [],
  officerId: null,
  officerName: null,
  officerDesignation: null,
  reason,
});

/**
 * PURE: given the candidate contacts in precedence order, pick the first that
 * has a usable email. Split out from the queries so the precedence rule is
 * unit-testable without a database.
 */
export function pickEmailableOfficer(
  candidates: readonly (ContactLite | null | undefined)[],
): ContactLite | null {
  for (const c of candidates) {
    if (c && isValidEmail(c.email)) return c;
  }
  return null;
}

async function fetchContacts(admin: SupabaseClient, ids: string[]): Promise<Map<string, ContactLite>> {
  const map = new Map<string, ContactLite>();
  const wanted = ids.filter(Boolean);
  if (!wanted.length) return map;
  const { data } = await admin.from("contacts").select(CONTACT_FIELDS).in("id", wanted);
  for (const row of (data as ContactLite[] | null) ?? []) map.set(row.id, row);
  return map;
}

export async function resolveComplaintEmailRecipients(
  admin: SupabaseClient,
  complaintId: string,
): Promise<EmailRecipients> {
  try {
    const { data: complaint } = await admin
      .from("complaints")
      .select("id, assigned_engineer_id, assigned_officer_id, contact_id, ward_id, ward:wards!ward_id(new_no)")
      .eq("id", complaintId)
      .maybeSingle();

    if (!complaint) return EMPTY("Complaint not found.");

    // Through `unknown`: supabase-js's inference types an embedded resource as an
    // array even for a many-to-one FK join, where it is an object at runtime —
    // the same assumption lib/queries.ts makes for this exact `ward:wards!ward_id`
    // embed. Normalized below so either shape works.
    const c = complaint as unknown as {
      assigned_engineer_id: string | null;
      assigned_officer_id: string | null;
      contact_id: string | null;
      ward_id: string | null;
      ward: { new_no: number | null } | { new_no: number | null }[] | null;
    };
    const ward = Array.isArray(c.ward) ? (c.ward[0] ?? null) : c.ward;

    const byId = await fetchContacts(admin, [
      c.assigned_engineer_id ?? "",
      c.assigned_officer_id ?? "",
      c.contact_id ?? "",
    ]);

    // Assigned engineer, then assigned officer, then whoever the case is filed
    // against — the same order the letter's own addressee is chosen in.
    let picked = pickEmailableOfficer([
      c.assigned_engineer_id ? byId.get(c.assigned_engineer_id) : null,
      c.assigned_officer_id ? byId.get(c.assigned_officer_id) : null,
      c.contact_id ? byId.get(c.contact_id) : null,
    ]);

    // Fall back to the ward-responsible officer from the directory.
    if (!picked && (c.ward_id || ward?.new_no != null)) {
      const resolved = await resolveOfficerForWard(admin, {
        wardId: c.ward_id,
        wardNo: ward?.new_no ?? null,
      });
      if (resolved && isValidEmail(resolved.contact.email)) {
        picked = resolved.contact as ContactLite;
      }
    }

    if (!picked) {
      return EMPTY(
        "No officer with an email address is on this complaint (no assigned engineer/officer with an email, and no ward officer in the directory). Add an email to the contact, or send the letter by post.",
      );
    }

    return {
      to: normalizeAddressList([picked.email]),
      cc: [],
      officerId: picked.id,
      officerName: officerDisplayName(picked) || null,
      officerDesignation: picked.designation ?? null,
      reason: null,
    };
  } catch (e) {
    console.warn("[mail] recipient resolution failed", complaintId, e);
    return EMPTY(e instanceof Error ? e.message : "Recipient resolution failed.");
  }
}
