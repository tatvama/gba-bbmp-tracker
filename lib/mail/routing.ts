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

/**
 * The letter descriptions a user may choose from when sending manually.
 *
 * letterKind lands verbatim in the email subject, so it must not be free text
 * coming off the wire: a `"use server"` export is a public endpoint, and an
 * unvalidated subject is both a header-injection surface and a way to send
 * official-looking mail saying anything at all.
 *
 * Limited to the kinds a REAL, distinctly-typed document exists for in
 * complaint_documents (see KIND_TO_DOC_TYPE, lib/mail/send.ts) — the only ones
 * this panel can attach correctly (it passes documentId: null so that lookup
 * actually runs — see the standalone <LetterEmailPanel> in
 * app/complaints/[id]/page.tsx). Escalation letter and Legal notice are
 * included despite being excluded from OFFICER_ADDRESSED_DRAFT_KINDS above —
 * that exclusion is about auto-emailing them to the complaint's own officer
 * over their head, not about this panel, where the user manually picks the
 * actual recipient (the next authority / vigilance cell) via "Add an officer
 * not in the system". (Legal notice needed a fix alongside this: it used to
 * share "Escalation letter" as its stored document_type — see
 * fileEscalationAction, lib/actions/complaints.ts.)
 *
 * Complaint letter is deliberately NOT here: filing it is the very first step
 * of the case, always auto-emailed at that point, so there is nothing for
 * this manual fallback panel to retry it for. Every OTHER draft kind
 * (follow-up letter, Action Taken Report request, site inspection request,
 * clarification request …) already gets emailed automatically, with its own
 * correct attachment, the moment it's filed from the AI Draft tab (see
 * mayAutoEmailOfficer above) — this manual panel is a fallback for when THAT
 * send was skipped, not a second way to pick among document types it cannot
 * actually attach.
 */
export const SELECTABLE_LETTER_KINDS = ["Reminder letter", "Counter-reply", "Escalation letter", "Legal notice"] as const;
export type SelectableLetterKind = (typeof SELECTABLE_LETTER_KINDS)[number];

/**
 * Coerce a caller-supplied letter kind to something safe.
 *
 * Anything not on the list becomes "Complaint letter" rather than being rejected,
 * because the internal filing actions legitimately pass richer labels (e.g.
 * "Reminder letter (no reply received)") and a hard failure there would lose the
 * email over a cosmetic mismatch. A prefix match keeps those working.
 */
export function sanitizeLetterKind(kind: string | null | undefined): string {
  const raw = (kind ?? "").replace(/[\r\n]+/g, " ").trim();
  if (!raw) return "Complaint letter";
  const exact = SELECTABLE_LETTER_KINDS.find((k) => k.toLowerCase() === raw.toLowerCase());
  if (exact) return exact;
  const prefixed = SELECTABLE_LETTER_KINDS.find(
    (k) => raw.toLowerCase().startsWith(k.toLowerCase()) || k.toLowerCase().startsWith(raw.toLowerCase()),
  );
  return prefixed ?? "Complaint letter";
}
