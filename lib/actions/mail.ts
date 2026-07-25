"use server";

import { revalidatePath } from "next/cache";
import { requireRole, getSessionUser, AuthorizationError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMPLAINT_FIELD_ROLES, COMPLAINT_WRITE_ROLES } from "@/lib/constants";
import { startJob } from "@/lib/jobs/runner";
// Side-effect import: registers the "email_send" handler. NEVER import this from
// instrumentation.ts or lib/startup/* — see the bundler note in instrumentation.ts.
import "@/lib/jobs/handlers";
import { resolveMailConfig, type MailMode } from "@/lib/mail/config";
import { verifyMailTransport } from "@/lib/mail/transport";

/**
 * Server actions for emailing filed letters.
 *
 * The letter is emailed by a background job rather than inline, so a slow or
 * stalled Gmail handshake can never hold up (or fail) the filing that triggered
 * it. queueLetterEmail is the internal entry point used by the filing actions;
 * sendLetterEmailAction is the user-facing "send it again" button.
 */

export interface QueueLetterEmailInput {
  complaintId: string;
  documentId?: string | null;
  letterKind?: string | null;
  submittedOn?: string | null;
}

/**
 * Enqueue the send. Callers treat this as best-effort: it returns a result rather
 * than throwing, and a false `ok` must never fail the caller's own operation.
 *
 * NOTE on dedupe: background_jobs has a partial unique index on
 * (type, entity_type, entity_id) while status is queued/running, so a second
 * send for the same complaint while one is still in flight silently REUSES the
 * first job instead of sending twice (lib/jobs/runner.ts catches 23505). That is
 * the behaviour we want here — double-filing a letter should not double-email an
 * officer — and it is why `reused` is surfaced to the caller.
 */
export async function queueLetterEmail(
  input: QueueLetterEmailInput,
  userId: string,
): Promise<{ ok: boolean; jobId?: string; reused?: boolean; error?: string }> {
  try {
    const admin = createAdminClient();
    return await startJob(admin, {
      type: "email_send",
      title: `Email ${input.letterKind?.trim() || "complaint letter"} to officer`,
      entityType: "complaint",
      entityId: input.complaintId,
      input: { ...input, userId },
      userId,
      link: `/complaints/${input.complaintId}`,
    });
  } catch (e) {
    console.warn("[mail] could not queue the letter email", input.complaintId, e);
    return { ok: false, error: e instanceof Error ? e.message : "Could not queue the email." };
  }
}

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
  const r = await queueLetterEmail(input, user.id);
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
