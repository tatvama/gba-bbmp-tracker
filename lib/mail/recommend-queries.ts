import "server-only";
import type { DbClient } from "@/lib/db";
import { createAdminClient } from "@/lib/db";
import { buildWardIndex, type ComplaintJurisdictionScope } from "@/lib/contacts/filter-hierarchy";
import { isValidEmail } from "./message";
import { resolveComplaintEmailRecipients } from "./recipients";
import { buildRecommendedRecipients, type JurisdictionContactRow, type RecommendedRecipient } from "./recommend-recipients";
import { mergeRecipientOptions, type ContactEmailRow, type RecipientOption } from "./recipient-options";

/** contacts.source tags used by scripts/import-gba-department-directory.ts —
 *  defined here rather than the import script so this read-side module has no
 *  dependency on anything under scripts/. */
export const GBA_DEPARTMENT_DIRECTORY_SOURCE = "GBA Department Directory";
export const GBA_DEPARTMENT_DIRECTORY_ADDENDUM_SOURCE = "BBMP Officer Directory (user-supplied, 2026-07-25)";

/**
 * DB-touching wrapper around lib/mail/recommend-recipients.ts's pure builder —
 * the recommend-recipients.ts analogue of how lib/mail/queries.ts wraps
 * recipient-options.ts. Same admin-client rationale as everywhere else in
 * lib/mail: letter_emails and the contact directory's email column carry
 * personal data gated deny-by-default under RLS, so every caller here is a
 * role-gated server action (lib/actions/mail.ts), never a request-scoped client.
 */

const JURISDICTION_CONTACT_FIELDS =
  "id, full_name, official_title, designation, role_level, email, officer_status, corporation_id, division_id, eng_subdivision_id, jurisdictions:contact_jurisdictions(ward_no)";

const WARD_HIERARCHY_SELECT =
  "new_no, division:divisions!division_id(id,name), eng_subdivision:eng_subdivisions!eng_subdivision_id(id,name)";

interface WardHierarchyRow {
  new_no: number | null;
  division: { id: string; name: string } | null;
  eng_subdivision: { id: string; name: string } | null;
}

export interface RecommendedRecipientsResult {
  recipients: RecommendedRecipient[];
  /** null only when the complaint itself wasn't found. */
  scope: ComplaintJurisdictionScope | null;
  /** Why resolveComplaintEmailRecipients found nobody to assign — populated only
   *  when it found nothing AND buildRecommendedRecipients also found nothing
   *  jurisdiction-scoped, so the panel has something to tell the user instead of
   *  a bare empty list. Threading this through means the panel no longer needs
   *  its own separate fetch of the full directory just to get this string. */
  resolutionReason: string | null;
}

async function fetchJurisdictionContacts(admin: DbClient): Promise<JurisdictionContactRow[]> {
  const { data } = await admin.from("contacts").select(JURISDICTION_CONTACT_FIELDS).not("email", "is", null).order("full_name");
  return (data as JurisdictionContactRow[] | null) ?? [];
}

/**
 * Recommended email recipients for one complaint, scoped to its own
 * corporation/division/eng-subdivision (plus any ward jurisdiction that
 * resolves into that scope). Never throws — degrades to an empty list, the
 * same "title/role only, no address" degradation resolveComplaintEmailRecipients
 * already follows.
 */
export async function listRecommendedRecipients(
  admin: DbClient,
  complaintId: string,
): Promise<RecommendedRecipientsResult> {
  try {
    const { data: complaint } = await admin
      .from("complaints")
      .select("id, corporation_id, division_id, eng_subdivision_id")
      .eq("id", complaintId)
      .maybeSingle();
    if (!complaint) return { recipients: [], scope: null, resolutionReason: "Complaint not found." };

    const c = complaint as { corporation_id: string | null; division_id: string | null; eng_subdivision_id: string | null };
    const scope: ComplaintJurisdictionScope = {
      corporationId: c.corporation_id,
      divisionId: c.division_id,
      engSubdivisionId: c.eng_subdivision_id,
    };

    // Independent reads — run together, only the splice below depends on them.
    const [rows, wardsResult, resolved] = await Promise.all([
      fetchJurisdictionContacts(admin),
      admin.from("wards").select(WARD_HIERARCHY_SELECT),
      resolveComplaintEmailRecipients(admin, complaintId),
    ]);
    const wardsData = (wardsResult.data as WardHierarchyRow[] | null) ?? [];

    // The suggested officer must be present in `rows` for buildRecommendedRecipients
    // to splice them in — fetch them individually if the base query (bounded to
    // contacts with SOME email) happens to have missed them for any reason.
    let allRows = rows;
    if (resolved.officerId && !rows.some((r) => r.id === resolved.officerId)) {
      const { data: extra } = await admin
        .from("contacts")
        .select(JURISDICTION_CONTACT_FIELDS)
        .eq("id", resolved.officerId)
        .maybeSingle();
      if (extra) allRows = [...rows, extra as JurisdictionContactRow];
    }

    const wardIndex = buildWardIndex(wardsData);
    const recipients = buildRecommendedRecipients(allRows, scope, wardIndex, isValidEmail, resolved.officerId);
    // resolved.reason explains why NO SINGLE officer could be assigned to the
    // case; only worth showing when the jurisdiction match also came up empty —
    // if buildRecommendedRecipients found division/ward-scoped candidates, the
    // user has something to pick from regardless of whether one is "assigned".
    const resolutionReason = recipients.length ? null : resolved.reason;
    return { recipients, scope, resolutionReason };
  } catch (e) {
    console.warn("[mail] listRecommendedRecipients failed", complaintId, e);
    return { recipients: [], scope: null, resolutionReason: e instanceof Error ? e.message : "Could not resolve recipients." };
  }
}

/**
 * Cross-cutting department-head / state-level candidates — the same for every
 * complaint, so callers may fetch/cache this once. Sourced from whichever
 * contacts came in via the department-directory import (lib/contacts/
 * gba-department-directory.ts) rather than jurisdiction matching: these posts
 * (Chief Engineer, Special Commissioner, CM's office, …) have no per-complaint
 * division to scope by. Returns [] gracefully before that import has run.
 */
export async function listDepartmentRecipients(admin: DbClient): Promise<RecipientOption[]> {
  try {
    const { data } = await admin
      .from("contacts")
      .select("id, full_name, official_title, designation, email, officer_status")
      .not("email", "is", null)
      .in("source", [GBA_DEPARTMENT_DIRECTORY_SOURCE, GBA_DEPARTMENT_DIRECTORY_ADDENDUM_SOURCE])
      .order("full_name");
    const rows = (data as ContactEmailRow[] | null) ?? [];
    return mergeRecipientOptions(rows, isValidEmail, null);
  } catch (e) {
    console.warn("[mail] listDepartmentRecipients failed", e);
    return [];
  }
}
