import { registerJobHandler } from "@/lib/jobs/registry";
import type { JobHandlerContext, JobHandlerOutcome } from "@/lib/jobs/types";
import { sendLetterEmail, type SendLetterEmailInput } from "@/lib/mail/send";

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

  await ctx.updateProgress(10, "Resolving recipient", "Looking up the officer's email address");

  const result = await sendLetterEmail(ctx.admin, {
    ...input,
    userId: input.userId ?? ctx.userId,
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
  const permanent = /EAUTH|invalid login|username and password not accepted|no recipients|55\d\s/i.test(message);
  return { error: message, retryable: !permanent };
}

registerJobHandler("email_send", handleEmailSend);
