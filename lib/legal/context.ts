/**
 * Context adapter — the ONLY module coupled to the complaint DB schema.
 *
 * Maps a loaded complaint row (+ draft options) to the resolver's DTO. Adding a new
 * resolution factor later means editing this one function, never the resolver. Pure
 * and synchronous: it does no I/O and takes the already-loaded row.
 */
import type { ComplaintType, ComplaintDraftKind } from "@/lib/constants";
import type { LegalResolutionContext } from "@/lib/legal/types";
import { resolveReceivingAuthority } from "@/lib/legal/authority";

export interface BuildContextOptions {
  draftKind: ComplaintDraftKind;
  /** Evidence signal — true when a forensic job audit / case-intelligence findings exist. */
  hasForensicFindings: boolean;
  /** Optional case-history / evidence text, folded into the keyword haystack. */
  caseHistoryText?: string | null;
}

/** Build the resolver DTO from a complaint row. `c` is the joined row loaded in
 *  runComplaintDraft (type, complaint_subtype, description, requested_action,
 *  responsible_department, location, ward, assigned_engineer, …). */
export function buildLegalResolutionContext(
  c: Record<string, any>,
  opts: BuildContextOptions,
): LegalResolutionContext {
  const responsibleDepartment: string | null = c.responsible_department ?? null;
  const engineerDesignation: string | null = c.assigned_engineer?.designation ?? null;

  return {
    type: (c.type as ComplaintType) ?? "Other",
    subtype: c.complaint_subtype ?? null,
    classifiedCategory: null,
    title: c.title ?? null,
    description: c.description ?? null,
    requestedAction: c.requested_action ?? null,
    responsibleDepartment,
    receivingAuthority: resolveReceivingAuthority({
      draftKind: opts.draftKind,
      responsibleDepartment,
      engineerDesignation,
      officeName: c.eng_subdivision?.name ?? null,
    }),
    draftKind: opts.draftKind,
    hasForensicFindings: opts.hasForensicFindings,
    location: c.location ?? null,
    caseHistoryText: opts.caseHistoryText ?? null,
  };
}
