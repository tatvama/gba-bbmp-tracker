"use server";

import { revalidatePath } from "next/cache";
import { requireRole, getSessionUser, AuthorizationError } from "@/lib/auth";
import { COMPLAINT_FIELD_ROLES, COMPLAINT_WRITE_ROLES } from "@/lib/constants";
import { resolveMailConfig, type MailMode } from "@/lib/mail/config";
import { verifyMailTransport } from "@/lib/mail/transport";
import { queueLetterEmail, type QueueLetterEmailInput } from "@/lib/mail/queue";

/**
 * User-facing server actions for letter email.
 *
 * EVERY export of this module is a dispatchable HTTP endpoint, so every export
 * here authorizes first. The un-gated enqueue helper deliberately lives in
 * lib/mail/queue.ts, which is not a `"use server"` module and therefore cannot be
 * called over the wire.
 */

/** Manually (re)send the letter email for a complaint. */
export async function sendLetterEmailAction(
  input: QueueLetterEmailInput,
): Promise<{ ok: boolean; jobId?: string; reused?: boolean; error?: string }> {
  let user;
  try {
    user = await requireRole(COMPLAINT_FIELD_ROLES);
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  // Only the complaint id and the letter identity are honoured — letterKind is
  // used verbatim in the subject, so it is not taken from the caller here.
  const r = await queueLetterEmail(
    { complaintId: input.complaintId, documentId: input.documentId ?? null, letterKind: input.letterKind ?? null },
    user.id,
  );
  revalidatePath(`/complaints/${input.complaintId}`);
  return r;
}

export interface MailStatus {
  mode: MailMode;
  /** The authenticated sending mailbox, or "" when unset. */
  sender: string;
  /** Where everything is diverted to, when in redirect mode. */
  redirectTo: string;
  /** Plain-English summary for the UI. */
  summary: string;
}

/** Report how outbound mail is configured, without exposing the app password. */
export async function getMailStatusAction(): Promise<MailStatus | { error: string }> {
  const user = await getSessionUser();
  if (!user) return { error: "Not authorized" };
  const c = resolveMailConfig(process.env);
  const summary =
    c.mode === "disabled"
      ? "Email sending is off (MAIL_ENABLED is not \"true\"). Letters are recorded but not emailed."
      : c.mode === "unconfigured"
        ? "Email sending is on but the Gmail account is not configured (GMAIL_USER / GMAIL_APP_PASSWORD)."
        : c.mode === "redirect"
          ? `Test mode: every letter email goes to ${c.redirectTo}. Officials are never contacted.`
          : `LIVE: letter emails go to the officials on record, from ${c.user}.`;
  return { mode: c.mode, sender: c.user, redirectTo: c.redirectTo, summary };
}

/** Prove the Gmail credentials work, without sending a message. */
export async function verifyMailAction(): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireRole(COMPLAINT_WRITE_ROLES);
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  return verifyMailTransport();
}
