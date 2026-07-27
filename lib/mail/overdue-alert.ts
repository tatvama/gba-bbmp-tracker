import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMailConfig, getMailTransport, fromHeader } from "./transport";
import { canSend, skipReason } from "./config";
import { applyRedirect, buildOverdueAlertEmail, type IntendedEnvelope, type OverdueAlertComplaintItem } from "./message";
import { COMPLAINT_OPEN_STATUSES } from "@/lib/constants";

/**
 * Emailing an overdue-alert DIGEST to one officer, covering every currently-
 * overdue complaint they are accountable for.
 *
 * "Accountable for" is not a separate marking a user sets up — it is derived
 * from real send history: lib/mail/send.ts records, on every letter actually
 * sent, exactly who it went to (the `recipients` jsonb column, added in
 * migration 0049 — directory picks AND hand-typed "add an officer not in the
 * system" entries alike, tagged role "to"/"cc"). That IS the checklist the
 * "Email this letter" panel shows: whoever has actually been sent a letter
 * about a complaint is who this alert holds accountable for it. A complaint
 * nobody has ever been emailed about has nobody to alert, on purpose — see
 * lib/complaints/overdue-alert-scheduler.ts, which does that derivation and
 * groups complaints by officer before calling this.
 *
 * Deliberately separate from sendLetterEmail() (lib/mail/send.ts) rather than a
 * branch inside it: this is a notification, not "here is a letter" — no
 * attachment, no letter-kind-to-document-type mapping, and its own outbox
 * `letter_kind` ("Overdue alert") so it's distinguishable in the history panel
 * and never mistaken for a filed letter when someone re-reads the outbox later.
 * Shares the redirect safety choke point and the transport with the letter-email
 * path (so Gmail's one-mailbox connection pool is genuinely shared, not
 * duplicated), and the same outbox table — one row per complaint the digest
 * covers, so each complaint's own Email History still shows the alert it was
 * part of, not just a total stranger covering unrelated cases.
 *
 * Never throws — same rule sendLetterEmail() follows. Called only from
 * lib/jobs/handlers/email-send.ts (request-triggered code), never from
 * instrumentation.ts's graph — nodemailer cannot be imported there. created_by
 * is left null on the outbox rows: nobody in the loop triggered this, the
 * sweeper did.
 */

export interface SendOverdueAlertDigestInput {
  officerEmail: string;
  officerName?: string | null;
  officerDesignation?: string | null;
  /** Complaints the sweeper found this officer accountable for and overdue AT
   *  QUEUE TIME. Re-verified against current status/next_follow_up_date below
   *  — a complaint replied to since the sweep ran must not be reported as
   *  still overdue just because the job describing it is a few minutes stale. */
  complaintIds: string[];
  /** ISO date (YYYY-MM-DD) the alert is being generated for, so the
   *  days-overdue count is computed consistently against it. */
  asOf: string;
  /** The background job driving this send. Supplying it makes a retry
   *  idempotent — same reason sendLetterEmail takes one: Gmail can accept the
   *  message and then drop the connection before nodemailer reads the 250,
   *  which surfaces as a retryable error for a digest that actually went out.
   *  Without this check a retry re-sends the same digest to the same officer. */
  jobId?: string | null;
}

export interface SendOverdueAlertDigestResult {
  ok: boolean;
  /** One outbox row per complaint actually included in the digest. Empty when
   *  nothing qualified (all complaints resolved since the sweep queued this). */
  outboxIds: string[];
  status: "sent" | "skipped" | "failed";
  to: string[];
  redirected: boolean;
  error?: string;
  /** The SMTP reply code, when the failure carried one — authoritative for
   *  retryability, see lib/mail/smtp-errors.ts. */
  responseCode?: number | null;
}

const OVERDUE_ALERT_KIND = "Overdue alert";

function daysBetween(fromIso: string, toIso: string): number | null {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

interface ComplaintRow {
  id: string;
  title: string | null;
  complaint_number: string | null;
  internal_case_number: string | null;
  job_number: string | null;
  status: string;
  next_follow_up_date: string | null;
  ward: { new_no: number | null; new_name: string | null } | { new_no: number | null; new_name: string | null }[] | null;
}

export async function sendOverdueAlertDigest(
  admin: SupabaseClient,
  input: SendOverdueAlertDigestInput,
): Promise<SendOverdueAlertDigestResult> {
  const config = getMailConfig();

  // ── Idempotency guard ────────────────────────────────────────────────────
  // Same reasoning as sendLetterEmail's own guard: a retry after Gmail already
  // accepted the message must not re-send. Every outbox row this digest wrote
  // shares the same job_id, so finding one 'sent' row for it means the whole
  // digest already went out.
  if (input.jobId) {
    const { data: already } = await admin
      .from("letter_emails")
      .select("id, to_addresses, redirected")
      .eq("job_id", input.jobId)
      .eq("status", "sent")
      .limit(1)
      .maybeSingle();
    const prior = already as { id: string; to_addresses: string[] | null; redirected: boolean } | null;
    if (prior) {
      console.warn(`[mail] overdue-alert job ${input.jobId} already delivered (outbox ${prior.id}) — not re-sending`);
      const { data: allPrior } = await admin.from("letter_emails").select("id").eq("job_id", input.jobId).eq("status", "sent");
      return {
        ok: true,
        outboxIds: ((allPrior as { id: string }[] | null) ?? []).map((r) => r.id),
        status: "sent",
        to: prior.to_addresses ?? [],
        redirected: Boolean(prior.redirected),
      };
    }
  }

  const { data: rows } = await admin
    .from("complaints")
    .select(
      "id, title, complaint_number, internal_case_number, job_number, status, next_follow_up_date, ward:wards!ward_id(new_no,new_name)",
    )
    .in("id", input.complaintIds)
    .is("deleted_at", null);

  const stillOverdue = ((rows as ComplaintRow[] | null) ?? []).filter(
    (c) =>
      (COMPLAINT_OPEN_STATUSES as readonly string[]).includes(c.status) &&
      c.next_follow_up_date != null &&
      c.next_follow_up_date < input.asOf,
  );

  if (!stillOverdue.length) {
    return {
      ok: true,
      outboxIds: [],
      status: "skipped",
      to: [],
      redirected: false,
      error: "None of the queued complaints are still overdue by send time.",
    };
  }

  const items: (OverdueAlertComplaintItem & { id: string })[] = stillOverdue.map((c) => {
    const ward = Array.isArray(c.ward) ? (c.ward[0] ?? null) : c.ward;
    const wardLabel = ward ? [ward.new_no, ward.new_name].filter((v) => v != null && v !== "").join(" - ") : null;
    return {
      id: c.id,
      complaintNumber: c.complaint_number ?? c.internal_case_number ?? null,
      jobNumber: c.job_number,
      complaintSubject: c.title,
      ward: wardLabel || null,
      followUpDate: c.next_follow_up_date,
      daysOverdue: c.next_follow_up_date ? daysBetween(c.next_follow_up_date, input.asOf) : null,
    };
  });

  const built = buildOverdueAlertEmail({
    officerName: input.officerName,
    officerDesignation: input.officerDesignation,
    complaints: items,
    senderName: config.fromName,
    senderContact: config.replyTo || config.user,
  });

  const intended: IntendedEnvelope = { to: [input.officerEmail], cc: [], subject: built.subject, text: built.text };

  // THE choke point, same as sendLetterEmail — nothing below constructs its own
  // recipient list.
  const envelope = applyRedirect(intended, config);

  const configSkip = skipReason(config);
  const noRecipient =
    envelope.to.length === 0
      ? config.mode === "redirect"
        ? "MAIL_REDIRECT_TO is not a valid email address."
        : "No recipient email address."
      : null;
  const skip = configSkip ?? noRecipient;

  const recipientsJson = [
    { name: input.officerName ?? null, designation: input.officerDesignation ?? null, email: input.officerEmail, source: "digest", role: "to" },
  ];

  const { data: inserted, error: insertError } = await admin
    .from("letter_emails")
    .insert(
      items.map((it) => ({
        complaint_id: it.id,
        document_id: null,
        letter_kind: OVERDUE_ALERT_KIND,
        to_addresses: envelope.to,
        cc_addresses: envelope.cc,
        intended_to: envelope.intendedTo,
        intended_cc: envelope.intendedCc,
        redirected: envelope.redirected,
        officer_id: null,
        subject: envelope.subject,
        body: envelope.text,
        attachment_name: null,
        status: skip ? "skipped" : "sending",
        error: skip,
        mail_mode: config.mode,
        recipients: recipientsJson,
        job_id: input.jobId ?? null,
        created_by: null,
      })),
    )
    .select("id");

  if (insertError) console.warn("[mail] could not write overdue-alert outbox rows", insertError.message);
  const outboxIds = ((inserted as { id: string }[] | null) ?? []).map((r) => r.id);

  if (skip) {
    return { ok: false, outboxIds, status: "skipped", to: envelope.to, redirected: envelope.redirected, error: skip };
  }

  try {
    if (!canSend(config)) throw new Error(`Mail is ${config.mode}.`);
    const info = await getMailTransport(config).sendMail({
      from: fromHeader(config),
      to: envelope.to,
      replyTo: config.replyTo || undefined,
      subject: envelope.subject,
      text: envelope.text,
    });

    const messageId = (info as { messageId?: string }).messageId ?? null;
    const sentAt = new Date().toISOString();

    if (outboxIds.length) {
      await admin
        .from("letter_emails")
        .update({ status: "sent", message_id: messageId, sent_at: sentAt, error: null })
        .in("id", outboxIds);
    }

    // Mirror into each complaint's correspondence history, same as a single
    // letter email would — one digest send, one log row per complaint covered.
    await admin.from("communication_logs").insert(
      items.map((it) => ({
        entity_type: "complaint",
        entity_id: it.id,
        comm_type: "Email",
        occurred_at: sentAt,
        summary: `Overdue alert emailed${envelope.redirected ? " (TEST MODE — diverted, the officer was NOT contacted)" : ""}: ${envelope.subject}`,
        phone_or_email: envelope.to.join(", "),
        contact_person: input.officerName ?? null,
        officer_id: null,
        document_id: null,
        created_by: null,
      })),
    );

    return { ok: true, outboxIds, status: "sent", to: envelope.to, redirected: envelope.redirected };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const responseCode = (e as { responseCode?: number }).responseCode ?? null;
    if (outboxIds.length) await admin.from("letter_emails").update({ status: "failed", error: message }).in("id", outboxIds);
    console.warn("[mail] overdue-alert digest send failed", input.officerEmail, message);
    return { ok: false, outboxIds, status: "failed", to: envelope.to, redirected: envelope.redirected, error: message, responseCode };
  }
}
