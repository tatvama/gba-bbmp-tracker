/**
 * Verify the outbound-letter mail path against the REAL Gmail account.
 *
 *   npx tsx --tsconfig scripts/tsconfig.pipeline.json scripts/verify-mail-send.ts
 *   npx tsx --tsconfig scripts/tsconfig.pipeline.json scripts/verify-mail-send.ts --send
 *
 * Without --send it only resolves the config and performs an SMTP handshake
 * (transporter.verify()), which authenticates but delivers nothing. With --send it
 * delivers ONE message through the real production code path.
 *
 * Safe by construction: it refuses to run at all unless MAIL_REDIRECT_TO is set,
 * so this script can never write to an official. It exercises the same
 * lib/mail/* modules the app uses — no duplicated transport config.
 */
import { getMailConfig, getMailTransport, fromHeader, verifyMailTransport } from "@/lib/mail/transport";
import { applyRedirect, buildLetterEmail } from "@/lib/mail/message";

const send = process.argv.includes("--send");
/** --complaint <uuid> runs the REAL sendLetterEmail orchestrator for that
 *  complaint (recipient resolution, PDF attachment from R2, outbox row,
 *  correspondence log) instead of the synthetic message. */
const complaintArg = (() => {
  const i = process.argv.indexOf("--complaint");
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
})();

function loadEnv() {
  try {
    (process as unknown as { loadEnvFile: (p?: string) => void }).loadEnvFile();
  } catch {
    /* already loaded */
  }
}
loadEnv();

async function main() {
  const config = getMailConfig();

  console.log("\n── Resolved mail configuration ──");
  console.log(`  mode        : ${config.mode}`);
  console.log(`  sender      : ${config.user || "(unset)"}`);
  console.log(`  from name   : ${config.fromName}`);
  console.log(`  reply-to    : ${config.replyTo || "(none)"}`);
  console.log(`  redirect to : ${config.redirectTo || "(none — LIVE)"}`);
  console.log(`  app password: ${config.password ? `present (${config.password.length} chars after whitespace stripping)` : "MISSING"}`);

  if (config.password && config.password.length !== 16) {
    console.log(
      `\n  ⚠ A Google App Password is always 16 characters. This one is ${config.password.length}.` +
        "\n    A regular account password will NOT authenticate against SMTP — Google" +
        "\n    requires an App Password (2-Step Verification, then" +
        "\n    https://myaccount.google.com/apppasswords).",
    );
  }

  // Refuse to run against real officials, whatever else is configured.
  if (config.mode === "live") {
    console.error("\n✗ Refusing to run: MAIL_REDIRECT_TO is not set, so this would write to real officials.");
    process.exit(1);
  }
  if (config.mode === "disabled" || config.mode === "unconfigured") {
    console.error(`\n✗ Cannot send: mode is "${config.mode}".`);
    process.exit(1);
  }

  console.log("\n── SMTP handshake (authenticates, sends nothing) ──");
  const verified = await verifyMailTransport();
  if (!verified.ok) {
    console.error(`  ✗ FAILED: ${verified.error}`);
    console.error("\n  Gmail rejects a normal account password. If the message above mentions");
    console.error("  \"Username and Password not accepted\" or \"Application-specific password");
    console.error("  required\", generate a 16-character App Password and put that in");
    console.error("  GMAIL_APP_PASSWORD instead.");
    process.exit(1);
  }
  console.log("  ✓ authenticated successfully");

  if (!send) {
    console.log("\n(Handshake only. Re-run with --send to deliver one test message.)");
    process.exit(0);
  }

  // ── The real production orchestrator, for one complaint ───────────────────
  if (complaintArg) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { sendLetterEmail } = await import("@/lib/mail/send");
    const admin = createAdminClient();

    console.log(`\n── Running the app's own sendLetterEmail for ${complaintArg} ──`);
    const result = await sendLetterEmail(admin, {
      complaintId: complaintArg,
      letterKind: "Complaint letter",
      submittedOn: new Date().toISOString().slice(0, 10),
    });

    console.log(`  status      : ${result.status}`);
    console.log(`  delivered to: ${result.to.join(", ") || "(none)"}`);
    console.log(`  redirected  : ${result.redirected}`);
    console.log(`  outbox row  : ${result.outboxId ?? "(none written)"}`);
    if (result.error) console.log(`  reason      : ${result.error}`);

    if (result.outboxId) {
      const { data } = await admin
        .from("letter_emails")
        .select("status, to_addresses, intended_to, redirected, attachment_name, subject, mail_mode, message_id, error")
        .eq("id", result.outboxId)
        .maybeSingle();
      console.log("\n── letter_emails row as stored ──");
      console.log(JSON.stringify(data, null, 2));

      const stored = (data ?? {}) as { to_addresses?: string[] };
      const leakedRow = (stored.to_addresses ?? []).filter((a) => a.endsWith("@bbmp.gov.in"));
      if (leakedRow.length) {
        console.error(`\n✗ SAFETY INVARIANT VIOLATED — official address was delivered to: ${leakedRow.join(", ")}`);
        process.exit(1);
      }
    }

    console.log(result.status === "sent" ? "\n✓ app path delivered" : `\n(app path did not send: ${result.status})`);
    process.exit(result.status === "failed" ? 1 : 0);
  }

  // ── One real message, through the real builders ────────────────────────────
  const built = buildLetterEmail({
    letterKind: "Complaint letter",
    officerName: "Sri M. Lokesh",
    officerDesignation: "Chief Engineer (Road Infrastructure)",
    complaintNumber: "DM-CMP-2026-000011",
    jobNumber: "206-24-000004",
    complaintSubject: "Verification of the outbound letter-email pipeline",
    ward: "209 - Gottigere",
    submittedOn: new Date().toISOString().slice(0, 10),
    attachmentName: null,
    senderName: config.fromName,
    senderContact: config.replyTo || config.user,
  });

  // The same choke point the app uses. In redirect mode this replaces the officer
  // address below with MAIL_REDIRECT_TO.
  const envelope = applyRedirect(
    { to: ["cemajroad@bbmp.gov.in"], cc: ["eic@bbmp.gov.in"], subject: built.subject, text: built.text },
    config,
  );

  console.log("\n── Envelope after applyRedirect ──");
  console.log(`  intended to : ${envelope.intendedTo.join(", ") || "(none)"}`);
  console.log(`  intended cc : ${envelope.intendedCc.join(", ") || "(none)"}`);
  console.log(`  ACTUAL to   : ${envelope.to.join(", ") || "(none)"}`);
  console.log(`  ACTUAL cc   : ${envelope.cc.join(", ") || "(none)"}`);
  console.log(`  redirected  : ${envelope.redirected}`);

  const leaked = [...envelope.to, ...envelope.cc, ...envelope.bcc].filter((a) => a.endsWith("@bbmp.gov.in"));
  if (leaked.length) {
    console.error(`\n✗ SAFETY INVARIANT VIOLATED — official addresses in the envelope: ${leaked.join(", ")}`);
    process.exit(1);
  }
  console.log("  ✓ no official address in any deliverable header");

  const info = await getMailTransport(config).sendMail({
    from: fromHeader(config),
    to: envelope.to,
    cc: envelope.cc.length ? envelope.cc : undefined,
    replyTo: config.replyTo || undefined,
    subject: envelope.subject,
    text: envelope.text,
  });

  console.log("\n── Delivered ──");
  console.log(`  message id  : ${(info as { messageId?: string }).messageId ?? "(none)"}`);
  console.log(`  accepted    : ${JSON.stringify((info as { accepted?: string[] }).accepted ?? [])}`);
  console.log(`  rejected    : ${JSON.stringify((info as { rejected?: string[] }).rejected ?? [])}`);
  console.log(`  response    : ${(info as { response?: string }).response ?? "(none)"}`);
  console.log(`\n✓ Check the ${envelope.to.join(", ")} inbox.`);
  process.exit(0);

}

main().catch((e) => {
  console.error("\n✗ verification crashed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
