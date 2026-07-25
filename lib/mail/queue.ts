import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { startJob } from "@/lib/jobs/runner";
// Side-effect import: registers the "email_send" handler. NEVER import this from
// instrumentation.ts or lib/startup/* — see the bundler note in instrumentation.ts.
import "@/lib/jobs/handlers";

/**
 * Enqueue the letter email. Server-internal ONLY — deliberately NOT in a
 * `"use server"` module.
 *
 * This used to live in lib/actions/mail.ts. Every export of a `"use server"`
 * module is a dispatchable HTTP endpoint, so a function that takes a
 * caller-supplied userId, performs no authorization, and sends official email on
 * the RLS-bypassing service-role client was reachable by anyone who knew its
 * action id — bypassing the role gate on the sendLetterEmailAction sitting right
 * next to it. Moving it here makes it structurally not an endpoint, the same
 * pattern lib/complaints/ack-attach.ts and lib/rti/letter-import.ts use.
 *
 * Callers must have already authorized the user; the userId is recorded as the
 * actor on the job and the audit rows.
 */

export interface QueueLetterEmailInput {
  complaintId: string;
  documentId?: string | null;
  letterKind?: string | null;
  submittedOn?: string | null;
}

export interface QueueLetterEmailResult {
  ok: boolean;
  jobId?: string;
  reused?: boolean;
  error?: string;
}

/**
 * Never throws or rejects: the filing actions call this with `void`, and an
 * unhandled rejection there would surface as a failed server action for a
 * complaint that was in fact filed successfully.
 *
 * DEDUPE: background_jobs has a partial unique index on
 * (type, entity_type, entity_id) while queued/running, and entity_id is the
 * complaint. A second send queued while one is still in flight therefore REUSES
 * the first job rather than sending twice. That is the safer default — an officer
 * should not get two copies — but it means a *different* letter queued in that
 * window would be dropped. So the reuse is recorded as a skipped outbox row
 * instead of vanishing, which is what makes it recoverable.
 */
export async function queueLetterEmail(
  input: QueueLetterEmailInput,
  userId: string,
): Promise<QueueLetterEmailResult> {
  try {
    const admin = createAdminClient();
    const letterKind = input.letterKind?.trim() || "Complaint letter";

    const started = await startJob(admin, {
      type: "email_send",
      title: `Email ${letterKind.toLowerCase()} to officer`,
      entityType: "complaint",
      entityId: input.complaintId,
      input: { ...input, letterKind, userId },
      userId,
      link: `/complaints/${input.complaintId}`,
    });

    if (started.ok && started.reused) {
      // Leave a trace, so "my letter was never emailed" is answerable.
      await admin
        .from("letter_emails")
        .insert({
          complaint_id: input.complaintId,
          document_id: input.documentId ?? null,
          letter_kind: letterKind,
          status: "skipped",
          error:
            "Another letter email for this complaint was already queued or sending, so this one was folded into it. Re-send from the case once that finishes.",
          mail_mode: "queued-reuse",
          created_by: userId,
        })
        .then(
          () => undefined,
          (e: unknown) => console.warn("[mail] could not record a queue-reuse row", e),
        );
    }

    return started;
  } catch (e) {
    console.warn("[mail] could not queue the letter email", input.complaintId, e);
    return { ok: false, error: e instanceof Error ? e.message : "Could not queue the email." };
  }
}
