import { registerJobHandler } from "@/lib/jobs/registry";
import type { JobHandlerContext, JobHandlerOutcome } from "@/lib/jobs/types";
import { sendLetterEmail, type SendLetterEmailInput } from "@/lib/mail/send";
import { isPermanentSmtpError } from "@/lib/mail/smtp-errors";

/**
 * Emails a filed letter to the responsible officer, as a background job.
 *
 * Why a job and not an inline await: an SMTP handshake to Gmail can take several
 * seconds and occasionally stalls to the socket timeout. Filing a letter must not
 * wait on that, and a transient network failure should retry on its own rather
 * than leaving the user to notice and re-click.
 *
 * A skipped send (mail disabled, no officer address) is reported as SUCCESS with
 * a `skipped` result, not as an error. It is a correct, expected outcome — the
 * outbox row records the reason, and retrying it would change nothing.
 */
async function handleEmailSend(ctx: JobHandlerContext): Promise<JobHandlerOutcome> {
  const input = (ctx.input ?? {}) as SendLetterEmailInput;
  if (!input.complaintId) return { error: "No complaintId on the job input.", retryable: false };

  // A queued/retrying job is cancelled immediately by cancelJobAction (nothing
  // is in flight yet), so this only ever matters for the narrow race where a
  // dispatch had already claimed the job (status -> "running") the instant
  // before cancellation landed. dispatchJob's own post-handler check (lib/jobs/
  // runner.ts) is what makes cancellation authoritative either way — this is
  // just an early exit so that race doesn't cost a real SMTP attempt.
  if (await ctx.isCancelled()) return { result: { status: "skipped", reason: "Cancelled" } };

  await ctx.updateProgress(10, "Resolving recipient", "Looking up the officer's email address");

  const result = await sendLetterEmail(ctx.admin, {
    ...input,
    userId: input.userId ?? ctx.userId,
    // Makes a retry idempotent: a send that Gmail accepted but whose 250 we never
    // read is recognised instead of repeated. See migration 0048.
    jobId: ctx.jobId,
  });

  if (result.status === "sent") {
    await ctx.updateProgress(
      100,
      "Sent",
      result.redirected
        ? `Diverted to ${result.to.join(", ")} (test mode — the officer was not contacted)`
        : `Sent to ${result.to.join(", ")}`,
    );
    return { result: { status: "sent", to: result.to, redirected: result.redirected, outboxId: result.outboxId } };
  }

  if (result.status === "skipped") {
    await ctx.updateProgress(100, "Skipped", result.error ?? "Nothing to send");
    return { result: { status: "skipped", reason: result.error, outboxId: result.outboxId } };
  }

  // A genuine failure. Authentication and address rejections are permanent — no
  // amount of retrying fixes a wrong app password or a mistyped mailbox, and
  // Gmail counts repeated auth failures against the account.
  const message = result.error ?? "Send failed.";
  return { error: message, retryable: !isPermanentSmtpError(message, result.responseCode) };
}

registerJobHandler("email_send", handleEmailSend);
