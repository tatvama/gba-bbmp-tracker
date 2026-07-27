import { registerJobHandler } from "@/lib/jobs/registry";
import type { JobHandlerContext, JobHandlerOutcome } from "@/lib/jobs/types";
import { sendLetterEmail, type SendLetterEmailInput } from "@/lib/mail/send";
import { sendOverdueAlertDigest, type SendOverdueAlertDigestInput } from "@/lib/mail/overdue-alert";
import { isPermanentSmtpError } from "@/lib/mail/smtp-errors";

/**
 * Emails a filed letter (or an overdue-alert digest to one officer) as a
 * background job.
 *
 * Why a job and not an inline await: an SMTP handshake to Gmail can take several
 * seconds and occasionally stalls to the socket timeout. Filing a letter must not
 * wait on that, and a transient network failure should retry on its own rather
 * than leaving the user to notice and re-click.
 *
 * A skipped send (mail disabled, no officer address) is reported as SUCCESS with
 * a `skipped` result, not as an error. It is a correct, expected outcome — the
 * outbox row records the reason, and retrying it would change nothing.
 *
 * Two kinds share this one handler deliberately: this file is the ONLY place
 * lib/mail/send.ts / lib/mail/overdue-alert.ts (and therefore nodemailer) may
 * be imported from, because it's reached exclusively via request-triggered
 * code (lib/jobs/handlers/index.ts, pulled in by lib/actions/mail.ts et al.),
 * never from instrumentation.ts's graph — see the long comment in
 * lib/complaints/overdue-alert-scheduler.ts for why that distinction is load-
 * bearing, not stylistic.
 */

interface OverdueAlertJobInput {
  kind: "overdue_alert";
  officerEmail: string;
  officerName?: string | null;
  officerDesignation?: string | null;
  complaintIds: string[];
  asOf?: string;
}

async function handleEmailSend(ctx: JobHandlerContext): Promise<JobHandlerOutcome> {
  const rawInput = (ctx.input ?? {}) as (SendLetterEmailInput & { kind?: "letter" }) | OverdueAlertJobInput;

  // A queued/retrying job is cancelled immediately by cancelJobAction (nothing
  // is in flight yet), so this only ever matters for the narrow race where a
  // dispatch had already claimed the job (status -> "running") the instant
  // before cancellation landed. dispatchJob's own post-handler check (lib/jobs/
  // runner.ts) is what makes cancellation authoritative either way — this is
  // just an early exit so that race doesn't cost a real SMTP attempt.
  if (await ctx.isCancelled()) return { result: { status: "skipped", reason: "Cancelled" } };

  if (rawInput.kind === "overdue_alert") {
    if (!rawInput.officerEmail || !rawInput.complaintIds?.length) {
      return { error: "Overdue-alert job is missing officerEmail/complaintIds.", retryable: false };
    }
    await ctx.updateProgress(
      10,
      "Checking complaints",
      `Verifying ${rawInput.complaintIds.length} complaint${rawInput.complaintIds.length === 1 ? "" : "s"} are still overdue`,
    );
    const result = await sendOverdueAlertDigest(ctx.admin, {
      officerEmail: rawInput.officerEmail,
      officerName: rawInput.officerName ?? null,
      officerDesignation: rawInput.officerDesignation ?? null,
      complaintIds: rawInput.complaintIds,
      asOf: rawInput.asOf ?? new Date().toISOString().slice(0, 10),
      // Makes a retry idempotent — see the guard at the top of sendOverdueAlertDigest.
      jobId: ctx.jobId,
    } satisfies SendOverdueAlertDigestInput);

    if (result.status === "sent") {
      await ctx.updateProgress(
        100,
        "Sent",
        result.redirected
          ? `Diverted to ${result.to.join(", ")} (test mode — the officer was not contacted)`
          : `Sent to ${result.to.join(", ")}`,
      );
      return { result: { status: "sent", to: result.to, redirected: result.redirected, outboxIds: result.outboxIds } };
    }
    if (result.status === "skipped") {
      await ctx.updateProgress(100, "Skipped", result.error ?? "Nothing to send");
      return { result: { status: "skipped", reason: result.error, outboxIds: result.outboxIds } };
    }
    const message = result.error ?? "Send failed.";
    return { error: message, retryable: !isPermanentSmtpError(message, result.responseCode ?? null) };
  }

  const input = rawInput;
  if (!input.complaintId) return { error: "No complaintId on the job input.", retryable: false };

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
  return { error: message, retryable: !isPermanentSmtpError(message, (result as { responseCode?: number | null }).responseCode ?? null) };
}

registerJobHandler("email_send", handleEmailSend);
