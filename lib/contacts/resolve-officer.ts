import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Contact, ContactJurisdiction } from "@/lib/types";
import { buildOfficerRecipient, type OfficerRecipient } from "./officer-recipient";

/**
 * Ward → responsible official resolver (the ward→officer lookup the app lacked).
 * Given a ward (by BBMP-225 number or by ward id), returns the official who
 * covers it from the Contact directory's contact_jurisdictions, shaped as a
 * ready-to-address recipient for AI letter drafting. Prefers an Active officer.
 * Never throws — returns null when no mapping exists (falls back to today's
 * sub-division-scoped resolution elsewhere).
 */
export interface ResolvedOfficer {
  contact: Contact;
  jurisdiction: ContactJurisdiction;
  recipient: OfficerRecipient;
}

export async function resolveOfficerForWard(
  admin: SupabaseClient,
  opts: { wardNo?: number | null; wardId?: string | null },
): Promise<ResolvedOfficer | null> {
  try {
    let q = admin
      .from("contact_jurisdictions")
      .select("*, contact:contacts(*)")
      .limit(10);
    if (opts.wardId) q = q.eq("ward_id", opts.wardId);
    else if (opts.wardNo != null) q = q.eq("ward_no", opts.wardNo);
    else return null;

    const { data } = await q;
    const rows = (data as (ContactJurisdiction & { contact: Contact | null })[] | null) ?? [];
    const withContact = rows.filter((r) => r.contact);
    if (!withContact.length) return null;

    // Prefer an Active officer; otherwise take the first mapping.
    const picked = withContact.find((r) => r.contact!.officer_status === "Active") ?? withContact[0]!;
    const { contact, ...jur } = picked;
    return {
      contact: contact!,
      jurisdiction: jur as ContactJurisdiction,
      recipient: buildOfficerRecipient(contact!, jur as ContactJurisdiction),
    };
  } catch (e) {
    console.warn("[resolve-officer] ward→officer lookup failed", opts, e);
    return null;
  }
}
