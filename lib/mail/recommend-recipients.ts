/**
 * Recommend officers to email, scoped to a complaint's division/sub-division
 * (PURE, framework-free, unit-tested) — the `recipient-options.ts` analogue for
 * "who plausibly has jurisdiction here" rather than "the whole directory".
 *
 * Two existing, separately-tested pieces are composed, not reinvented:
 *
 *   MEMBERSHIP — lib/contacts/filter-hierarchy.ts's contactMatchesJurisdictionIds
 *   answers "is this contact in scope at all, and via which path" (their own
 *   corporation/division/eng-subdivision FK, OR a contact_jurisdictions ward row
 *   that resolves into scope — the only place in the codebase that unions both
 *   officer-attachment styles). It returns EVERY matching path, not just one, so
 *   nobody is silently dropped the way lib/distribution/resolve-recipients.ts's
 *   `pool.find(...)` drops a second Assistant Executive Engineer in one
 *   sub-division.
 *
 *   LABELLING — lib/complaints/recipient-roles.ts's contactMatchesRole decides
 *   the human-readable "why": a match against one of the 13 curated postal roles
 *   becomes "Executive Engineer — Division Level"; anyone else who is
 *   genuinely in scope still gets a generic "<designation> — Division Level"
 *   label rather than being dropped for not matching a curated title — the
 *   recommender's whole point is coverage, not curation.
 *
 * mergeRecipientOptions (recipient-options.ts) still does the shared-mailbox
 * merge, UNCHANGED — reasons are attached as a decoration afterward, keeping
 * that already-shipped, live-send-verified function's contract identical.
 *
 * The complaint's own already-resolved officer (resolveComplaintEmailRecipients)
 * is a distinct, first-class concept, not a special case of jurisdiction
 * matching — "who is this case assigned to" and "who has jurisdiction" are
 * different questions, so a caller-supplied `suggestedContactId` is always
 * included and tagged "Assigned to this case", even when their own jurisdiction
 * match didn't independently surface them (e.g. an assigned engineer from
 * outside the complaint's own sub-division).
 */
import { COMPLAINT_RECIPIENT_ROLES, contactMatchesRole } from "@/lib/complaints/recipient-roles";
import {
  contactMatchesJurisdictionIds,
  type ComplaintJurisdictionScope,
  type WardHierarchyIndex,
} from "@/lib/contacts/filter-hierarchy";
import { mergeRecipientOptions, type ContactEmailRow, type RecipientOption } from "./recipient-options";

/** Contact row shape this module needs: recipient-options.ts's fields, widened
 *  with the jurisdiction columns. A superset of both lib/mail/recipients.ts's
 *  ContactLite and lib/distribution/resolve-recipients.ts's SELECT, for the
 *  same reason ContactLite documents: these are loose strings straight out of
 *  Postgres, not the constrained DESIGNATIONS/OFFICE union the contact FORM
 *  uses — an imported officer may carry a designation that predates it. */
export interface JurisdictionContactRow extends ContactEmailRow {
  role_level: string | null;
  corporation_id: string | null;
  division_id: string | null;
  eng_subdivision_id: string | null;
  jurisdictions: { ward_no: number | null }[];
}

export type RecommendReasonKind =
  | "role_zone"
  | "role_division"
  | "role_subdivision"
  | "generic_zone"
  | "generic_division"
  | "generic_subdivision"
  | "ward_officer"
  | "assigned";

export interface RecommendReason {
  kind: RecommendReasonKind;
  /** "Executive Engineer — Division Level" / "Ward-responsible officer" / "Assigned to this case" */
  label: string;
  /** Whose match produced this reason — needed to attribute it correctly after
   *  the shared-mailbox merge, where several officers can back one option. */
  contactId: string;
}

/** RecipientOption (recipient-options.ts) + why it's here. A structural
 *  superset, so every existing render path for a RecipientOption (o.label,
 *  o.email, o.suggested, o.note, o.officers…) works unchanged for these too. */
export interface RecommendedRecipient extends RecipientOption {
  reasons: RecommendReason[];
}

/** The tier's own curated `.level` string (e.g. "Division Level"), so a generic
 *  fallback label reads identically to a curated one instead of inventing its
 *  own wording that could drift from the postal side. */
function tierLabel(tier: "zone" | "division" | "subdivision"): string {
  return COMPLAINT_RECIPIENT_ROLES.find((r) => r.jurisdiction === tier)?.level ?? tier;
}

function reasonForFkPath(
  row: JurisdictionContactRow,
  tier: "zone" | "division" | "subdivision",
): RecommendReason {
  const role = COMPLAINT_RECIPIENT_ROLES.find((r) => r.jurisdiction === tier && contactMatchesRole(row, r));
  return role
    ? { kind: `role_${tier}`, label: `${role.title} — ${role.level}`, contactId: row.id }
    : { kind: `generic_${tier}`, label: `${row.designation ?? "Officer"} — ${tierLabel(tier)}`, contactId: row.id };
}

/**
 * Build the recommended-recipient list for one complaint's jurisdiction scope.
 *
 * `rows` should include every non-null-email contact (the same base query
 * listRecipientOptions already runs) PLUS, if not already in that set, the
 * contact backing `suggestedContactId` — the DB wrapper (recommend-queries.ts)
 * is responsible for that splice; this function only decides scope and labels.
 */
export function buildRecommendedRecipients(
  rows: readonly JurisdictionContactRow[],
  scope: ComplaintJurisdictionScope,
  wardIndex: WardHierarchyIndex,
  isUsable: (email: unknown) => boolean,
  suggestedContactId: string | null,
): RecommendedRecipient[] {
  const reasonsByContactId = new Map<string, RecommendReason[]>();
  const inScopeIds = new Set<string>();

  for (const row of rows) {
    if (!isUsable(row.email)) continue;
    const paths = contactMatchesJurisdictionIds(row, scope, wardIndex);
    const isSuggested = suggestedContactId != null && row.id === suggestedContactId;
    if (!paths.length && !isSuggested) continue;

    inScopeIds.add(row.id);
    const reasons: RecommendReason[] = [];
    if (isSuggested) reasons.push({ kind: "assigned", label: "Assigned to this case", contactId: row.id });
    for (const path of paths) {
      reasons.push(
        path === "ward_jurisdiction"
          ? { kind: "ward_officer", label: "Ward-responsible officer", contactId: row.id }
          : reasonForFkPath(row, path === "corporation_fk" ? "zone" : path === "division_fk" ? "division" : "subdivision"),
      );
    }
    reasonsByContactId.set(row.id, reasons);
  }

  // mergeRecipientOptions itself decides shared-mailbox attribution/labelling —
  // called unchanged, over only the in-scope rows, so its contract for its
  // existing caller (listRecipientOptions) is untouched.
  const inScopeRows = rows.filter((r) => inScopeIds.has(r.id));
  const options = mergeRecipientOptions(inScopeRows, isUsable, suggestedContactId);

  return options.map((o) => {
    const reasons: RecommendReason[] = [];
    const seen = new Set<string>();
    for (const officer of o.officers) {
      for (const r of reasonsByContactId.get(officer.contactId) ?? []) {
        const key = `${r.kind}:${r.label}`;
        if (seen.has(key)) continue;
        seen.add(key);
        reasons.push(r);
      }
    }
    return { ...o, reasons };
  });
}
