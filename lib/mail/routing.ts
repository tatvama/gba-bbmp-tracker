/**
 * Which filed letters may be auto-emailed to the complaint's own officer (PURE,
 * unit-tested).
 *
 * The email recipient resolver (lib/mail/recipients.ts) answers one question:
 * "who is the officer responsible for THIS complaint?" That is the right
 * addressee for a letter written to the department handling the case — a
 * follow-up, a reminder, a site-inspection request, a counter-reply to their own
 * reply.
 *
 * It is the WRONG addressee for a letter whose whole purpose is to go over that
 * officer's head: an escalation to the next authority, a Lokayukta complaint, a
 * PIL letter-petition to the Chief Justice, a TVCC vigilance copy. Auto-emailing
 * those to the very officer being complained about would be a real-world harm, not
 * a cosmetic bug — so they are excluded here and must be sent deliberately via
 * sendLetterEmailAction once a correct address is known.
 *
 * Deny-by-default: a draft kind that is not explicitly listed is not auto-emailed.
 */
import type { ComplaintDraftKind } from "@/lib/constants";

/** Draft kinds addressed to the complaint's own responsible officer. */
export const OFFICER_ADDRESSED_DRAFT_KINDS: readonly ComplaintDraftKind[] = [
  "followup_letter",
  "reminder_letter",
  "reminder_email",
  "action_taken_request",
  "site_inspection_request",
  "clarification_request",
  "counter_reply",
];

/**
 * True when a letter of this kind is addressed to the officer on the case, and so
 * may be emailed automatically when filed.
 *
 * `null`/`undefined` (an untyped or ad-hoc letter) returns false: we do not guess
 * at the addressee of a letter whose kind we do not know.
 */
export function mayAutoEmailOfficer(kind: ComplaintDraftKind | string | null | undefined): boolean {
  if (!kind) return false;
  return (OFFICER_ADDRESSED_DRAFT_KINDS as readonly string[]).includes(kind);
}
