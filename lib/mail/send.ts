import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { R2_STORAGE_SENTINEL } from "@/lib/constants";
import { downloadFromR2ByKey } from "@/lib/storage/r2-upload";
import { getSignedUrl } from "@/lib/storage/supabase-upload";
import { getMailConfig, getMailTransport, fromHeader } from "./transport";
import { canSend, skipReason } from "./config";
import { applyRedirect, buildLetterEmail, type IntendedEnvelope } from "./message";
import { resolveComplaintEmailRecipients } from "./recipients";

/**
 * Emailing a filed letter to the responsible officer, end to end.
 *
 * Ordering is deliberate: the outbox row is written BEFORE the SMTP call and
 * updated after. A process that dies mid-send therefore leaves a 'sending' row
 * that can be found and reconciled, instead of a letter that may or may not have
 * gone out with nothing to say which.
 *
 * This function never throws. Emailing is strictly secondary to filing — the
 * same rule lib/distribution/distribution-service.ts follows for the office copy
 * ("filed letter kept"). A refused SMTP connection must never roll back a
 * complaint that has genuinely been submitted.
 */

/** Letter document types that are worth attaching, newest first when several. */
const LETTER_DOC_TYPES = [
  "Generated complaint letter (PDF)",
  "Reminder letter",
  "Legal notice",
  "Escalation letter",
  "Counter-reply",
  "TVCC copy (PDF)",
  "Generated complaint letter",
];

/**
 * The document type each letterKind should attach.
 *
 * Without this the newest letter PDF on the case wins, which is wrong whenever a
 * case has more than one letter: a filing announced as a "Complaint letter" would
 * arrive carrying the most recent counter-reply. Observed for real on
 * DM-CMP-2026-000011, which is why this map exists.
 */
const KIND_TO_DOC_TYPE: Record<string, string[]> = {
  "complaint letter": ["Generated complaint letter (PDF)", "Generated complaint letter"],
  "counter-reply": ["Counter-reply"],
  "reminder letter": ["Reminder letter"],
  "legal notice": ["Legal notice"],
  "escalation letter": ["Escalation letter"],
  "tvcc complaint": ["TVCC copy (PDF)"],
};

/** Document types to prefer for this letter kind, best first. */
function preferredDocTypes(letterKind: string): string[] {
  const key = letterKind.trim().toLowerCase();
  if (KIND_TO_DOC_TYPE[key]) return KIND_TO_DOC_TYPE[key]!;
  // An unmapped kind (a new draft kind, or a label with a suffix) — match by
  // prefix so "Reminder letter (no reply received)" still finds its document.
  const loose = Object.keys(KIND_TO_DOC_TYPE).find((k) => key.startsWith(k) || k.startsWith(key));
  return loose ? KIND_TO_DOC_TYPE[loose]! : [];
}

export interface SendLetterEmailInput {
  complaintId: string;
  /** Attach this specific document. When omitted the newest letter PDF is used. */
  documentId?: string | null;
  /** "Reminder letter", "Legal notice" … Defaults to "Complaint letter". */
  letterKind?: string | null;
  /** Recorded on the outbox row. */
  userId?: string | null;
  /** Shown in the covering note when the letter was also physically submitted. */
  submittedOn?: string | null;
}

export interface SendLetterEmailResult {
  ok: boolean;
  /** The outbox row id — present even when nothing was sent. */
  outboxId?: string;
  status: "sent" | "skipped" | "failed";
  /** Where it actually went (the test inbox, in redirect mode). */
  to: string[];
  redirected: boolean;
  error?: string;
}

interface DocRow {
  id: string;
  document_type: string | null;
  original_file_name: string | null;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
}

/** Pull the letter's bytes so it can ride along as a real attachment rather than
 *  a link the officer would need an account to open. */
async function loadAttachment(
  admin: SupabaseClient,
  complaintId: string,
  documentId: string | null | undefined,
  letterKind: string,
): Promise<{ filename: string; content: Buffer; documentId: string } | null> {
  try {
    let doc: DocRow | null = null;

    if (documentId) {
      const { data } = await admin
        .from("complaint_documents")
        .select("id, document_type, original_file_name, storage_bucket, storage_path, mime_type")
        .eq("id", documentId)
        .maybeSingle();
      doc = (data as DocRow | null) ?? null;
    } else {
      const { data } = await admin
        .from("complaint_documents")
        .select("id, document_type, original_file_name, storage_bucket, storage_path, mime_type")
        .eq("complaint_id", complaintId)
        .in("document_type", LETTER_DOC_TYPES)
        .order("created_at", { ascending: false });
      const rows = (data as DocRow[] | null) ?? [];
      const isPdf = (r: DocRow) => (r.mime_type ?? "").includes("pdf");

      // Match the letter being sent, in the order those types are preferred, and
      // only then fall back to "newest letter on the case".
      for (const wanted of preferredDocTypes(letterKind)) {
        const matches = rows.filter((r) => r.document_type === wanted);
        doc = matches.find(isPdf) ?? matches[0] ?? null;
        if (doc) break;
      }
      // Prefer a PDF over the DOCX of the same letter — an officer can always
      // open a PDF, and it is the version that was physically submitted.
      if (!doc) doc = rows.find(isPdf) ?? rows[0] ?? null;
    }

    if (!doc) return null;

    const filename = doc.original_file_name?.trim() || `${doc.document_type ?? "letter"}.pdf`;

    if (doc.storage_bucket === R2_STORAGE_SENTINEL) {
      const content = await downloadFromR2ByKey(doc.storage_path);
      return content ? { filename, content, documentId: doc.id } : null;
    }

    // Supabase Storage fallback (pre-R2 documents).
    const url = await getSignedUrl(doc.storage_bucket, doc.storage_path, 300);
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    return { filename, content: Buffer.from(await res.arrayBuffer()), documentId: doc.id };
  } catch (e) {
    console.warn("[mail] attachment load failed", complaintId, documentId, e);
    return null;
  }
}

export async function sendLetterEmail(
  admin: SupabaseClient,
  input: SendLetterEmailInput,
): Promise<SendLetterEmailResult> {
  const config = getMailConfig();
  const letterKind = input.letterKind?.trim() || "Complaint letter";

  // ── Gather context ───────────────────────────────────────────────────────
  const { data: complaintRow } = await admin
    .from("complaints")
    .select("id, title, complaint_number, internal_case_number, job_number, ward:wards!ward_id(new_no,new_name)")
    .eq("id", input.complaintId)
    .maybeSingle();

  const complaint = (complaintRow ?? null) as {
    title: string | null;
    complaint_number: string | null;
    internal_case_number: string | null;
    job_number: string | null;
    ward: { new_no: number | null; new_name: string | null } | null;
  } | null;

  const recipients = await resolveComplaintEmailRecipients(admin, input.complaintId);
  const attachment = await loadAttachment(admin, input.complaintId, input.documentId, letterKind);
  // Record the document that was actually attached, not the one that was asked
  // for — when documentId is null the picker chooses, and an audit row pointing
  // at nothing (or at a different letter) would misrepresent what was sent.
  const attachedDocumentId = attachment?.documentId ?? input.documentId ?? null;

  const wardLabel = complaint?.ward
    ? [complaint.ward.new_no, complaint.ward.new_name].filter((v) => v != null && v !== "").join(" - ")
    : null;

  const built = buildLetterEmail({
    letterKind,
    officerName: recipients.officerName,
    officerDesignation: recipients.officerDesignation,
    complaintNumber: complaint?.complaint_number ?? complaint?.internal_case_number ?? null,
    jobNumber: complaint?.job_number ?? null,
    complaintSubject: complaint?.title ?? null,
    ward: wardLabel || null,
    submittedOn: input.submittedOn ?? null,
    attachmentName: attachment?.filename ?? null,
    senderName: config.fromName,
    senderContact: config.replyTo || config.user,
  });

  const intended: IntendedEnvelope = {
    to: recipients.to,
    cc: recipients.cc,
    subject: built.subject,
    text: built.text,
  };

  // THE choke point. Nothing below constructs its own recipient list.
  const envelope = applyRedirect(intended, config);

  // ── Decide whether this can go out at all ────────────────────────────────
  const configSkip = skipReason(config);
  const noRecipient =
    envelope.to.length === 0
      ? config.mode === "redirect"
        ? "MAIL_REDIRECT_TO is not a valid email address."
        : (recipients.reason ?? "No recipient email address could be resolved.")
      : null;
  const skip = configSkip ?? noRecipient;

  // ── Record the attempt before making it ──────────────────────────────────
  const { data: inserted, error: insertError } = await admin
    .from("letter_emails")
    .insert({
      complaint_id: input.complaintId,
      document_id: attachedDocumentId,
      letter_kind: letterKind,
      to_addresses: envelope.to,
      cc_addresses: envelope.cc,
      intended_to: envelope.intendedTo,
      intended_cc: envelope.intendedCc,
      redirected: envelope.redirected,
      officer_id: recipients.officerId,
      subject: envelope.subject,
      body: envelope.text,
      attachment_name: attachment?.filename ?? null,
      status: skip ? "skipped" : "sending",
      error: skip,
      mail_mode: config.mode,
      created_by: input.userId ?? null,
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    console.warn("[mail] could not write outbox row", insertError.message);
  }
  const outboxId = (inserted as { id: string } | null)?.id;

  if (skip) {
    return { ok: false, outboxId, status: "skipped", to: envelope.to, redirected: envelope.redirected, error: skip };
  }

  // ── Send ─────────────────────────────────────────────────────────────────
  try {
    if (!canSend(config)) throw new Error(`Mail is ${config.mode}.`);
    const info = await getMailTransport(config).sendMail({
      from: fromHeader(config),
      to: envelope.to,
      cc: envelope.cc.length ? envelope.cc : undefined,
      replyTo: config.replyTo || undefined,
      subject: envelope.subject,
      text: envelope.text,
      attachments: attachment
        ? [{ filename: attachment.filename, content: attachment.content, contentType: "application/pdf" }]
        : undefined,
    });

    const messageId = (info as { messageId?: string }).messageId ?? null;
    const sentAt = new Date().toISOString();

    if (outboxId) {
      await admin
        .from("letter_emails")
        .update({ status: "sent", message_id: messageId, sent_at: sentAt, error: null })
        .eq("id", outboxId);
    }

    // Mirror into the case's correspondence history, so an emailed letter appears
    // alongside the calls and postal submissions instead of only in the outbox.
    await admin.from("communication_logs").insert({
      entity_type: "complaint",
      entity_id: input.complaintId,
      comm_type: "Email",
      occurred_at: sentAt,
      summary: `${letterKind} emailed${envelope.redirected ? " (TEST MODE — diverted, the officer was NOT contacted)" : ""}: ${envelope.subject}`,
      phone_or_email: envelope.to.join(", "),
      contact_person: recipients.officerName,
      officer_id: recipients.officerId,
      document_id: attachedDocumentId,
      created_by: input.userId ?? null,
    });

    return { ok: true, outboxId, status: "sent", to: envelope.to, redirected: envelope.redirected };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (outboxId) {
      await admin.from("letter_emails").update({ status: "failed", error: message }).eq("id", outboxId);
    }
    console.warn("[mail] send failed", input.complaintId, message);
    return { ok: false, outboxId, status: "failed", to: envelope.to, redirected: envelope.redirected, error: message };
  }
}
