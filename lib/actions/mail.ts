"use server";

import { revalidatePath } from "next/cache";
import { requireRole, getSessionUser, AuthorizationError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMPLAINT_FIELD_ROLES, COMPLAINT_WRITE_ROLES } from "@/lib/constants";
import { resolveMailConfig, type MailMode } from "@/lib/mail/config";
import { verifyMailTransport } from "@/lib/mail/transport";
import { isValidEmail } from "@/lib/mail/message";
import { sanitizeLetterKind } from "@/lib/mail/routing";
import { sendLetterEmail, type ManualRecipient } from "@/lib/mail/send";
import {
  listLetterEmails,
  listRecipientOptions,
  listRecommendedRecipients,
  listDepartmentRecipients,
  type LetterEmailRow,
  type RecipientOption,
  type RecommendedRecipient,
} from "@/lib/mail/queries";

/**
 * User-facing server actions for letter email.
 *
 * EVERY export of this module is a dispatchable HTTP endpoint, so every export
 * authorizes first and validates its own input. The un-gated enqueue helper used
 * by the automatic path lives in lib/mail/queue.ts, which is NOT a `"use server"`
 * module and therefore cannot be called over the wire.
 */

/** No single letter needs more addressees than this; the cap is an abuse limit. */
const MAX_RECIPIENTS = 20;

export interface SendLetterEmailActionInput {
  complaintId: string;
  documentId?: string | null;
  letterKind?: string | null;
  to?: ManualRecipient[] | null;
  cc?: ManualRecipient[] | null;
}

export interface SendLetterEmailActionResult {
  ok: boolean;
  status?: "sent" | "skipped" | "failed";
  /** Where it actually went — the test inbox while MAIL_REDIRECT_TO is set. */
  to?: string[];
  redirected?: boolean;
  error?: string;
}

/** Keep only well-formed addresses, cap the count, and trim the names. */
function cleanRecipients(list: ManualRecipient[] | null | undefined): ManualRecipient[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: ManualRecipient[] = [];
  for (const r of list) {
    const email = typeof r?.email === "string" ? r.email.trim().toLowerCase() : "";
    if (!isValidEmail(email) || seen.has(email)) continue;
    seen.add(email);
    // Name and designation ride into the salutation, so cap the length and
    // collapse whitespace. sanitizeHeaderText handles the subject separately;
    // these only reach the body.
    const trim = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 120) : "");
    const name = trim(r?.name);
    const designation = trim(r?.designation);
    out.push({ name: name || null, designation: designation || null, email });
    if (out.length >= MAX_RECIPIENTS) break;
  }
  return out;
}

/**
 * Send the letter email now, to the recipients the user chose or typed.
 *
 * Runs INLINE rather than as a background job, unlike the automatic send on
 * filing. Two reasons: the user is waiting and should be told "sent" or exactly
 * why not; and background_jobs dedupes on (type, complaint) while queued/running,
 * so a deliberate send could otherwise be silently folded into an in-flight
 * automatic one.
 */
export async function sendLetterEmailAction(
  input: SendLetterEmailActionInput,
): Promise<SendLetterEmailActionResult> {
  let user;
  try {
    user = await requireRole(COMPLAINT_FIELD_ROLES);
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }

  const complaintId = typeof input?.complaintId === "string" ? input.complaintId.trim() : "";
  if (!complaintId) return { ok: false, error: "No complaint given." };

  const to = cleanRecipients(input.to);
  const cc = cleanRecipients(input.cc).filter((c) => !to.some((t) => t.email === c.email));

  if (!to.length) {
    return {
      ok: false,
      error: "Add at least one valid recipient email address before sending.",
    };
  }

  try {
    const admin = createAdminClient();
    const result = await sendLetterEmail(admin, {
      complaintId,
      documentId: typeof input.documentId === "string" ? input.documentId : null,
      // Never trust a caller-supplied subject fragment — this lands in the
      // Subject header verbatim.
      letterKind: sanitizeLetterKind(input.letterKind),
      userId: user.id,
      toOverride: to,
      ccOverride: cc,
    });

    revalidatePath(`/complaints/${complaintId}`);
    return {
      ok: result.status === "sent",
      status: result.status,
      to: result.to,
      redirected: result.redirected,
      error: result.error,
    };
  } catch (e) {
    // sendLetterEmail is documented never to throw, but this is the outermost
    // boundary of a public endpoint — do not leak a stack to the client.
    console.warn("[mail] sendLetterEmailAction failed", complaintId, e);
    return { ok: false, status: "failed", error: "The email could not be sent. Check the server log." };
  }
}

/** Send history for the complaint, for the panel's "past attempts" list. */
export async function listLetterEmailsAction(
  complaintId: string,
): Promise<{ rows?: LetterEmailRow[]; error?: string }> {
  try {
    await requireRole(COMPLAINT_FIELD_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  return { rows: await listLetterEmails(complaintId) };
}

/** Selectable recipients plus, when nothing resolved, the reason why. */
export async function listRecipientOptionsAction(
  complaintId: string,
): Promise<{ options?: RecipientOption[]; resolutionReason?: string | null; error?: string }> {
  try {
    await requireRole(COMPLAINT_FIELD_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const { options, resolutionReason } = await listRecipientOptions(complaintId);
  return { options, resolutionReason };
}

/** Officers recommended for this complaint's own division/sub-division, each
 *  labelled with why — see lib/mail/recommend-recipients.ts. */
export async function listRecommendedRecipientsAction(
  complaintId: string,
): Promise<{ recipients?: RecommendedRecipient[]; resolutionReason?: string | null; error?: string }> {
  try {
    await requireRole(COMPLAINT_FIELD_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const admin = createAdminClient();
  const { recipients, resolutionReason } = await listRecommendedRecipients(admin, complaintId);
  return { recipients, resolutionReason };
}

/** Cross-cutting department-head / state-level candidates, the same for every
 *  complaint — shown collapsed behind a "Show head-office contacts" toggle. */
export async function listDepartmentRecipientsAction(): Promise<{ options?: RecipientOption[]; error?: string }> {
  try {
    await requireRole(COMPLAINT_FIELD_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const admin = createAdminClient();
  return { options: await listDepartmentRecipients(admin) };
}

export interface MailStatus {
  mode: MailMode;
  sender: string;
  redirectTo: string;
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
