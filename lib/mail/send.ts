import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { R2_STORAGE_SENTINEL } from "@/lib/constants";
import { downloadFromR2ByKey } from "@/lib/storage/r2-upload";
import { getSignedUrl } from "@/lib/storage/supabase-upload";
import { getMailConfig, getMailTransport, fromHeader } from "./transport";
import { canSend, skipReason } from "./config";
import { applyRedirect, buildLetterEmail, isValidEmail, normalizeAddressList, type IntendedEnvelope } from "./message";
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

/**
 * Types the untyped fallback may pick from — the officer-addressed primary letter
 * and nothing else.
 *
 * Deliberately EXCLUDES "TVCC copy (PDF)", "Legal notice" and "Escalation letter".
 * Those are addressed over the officer's head, and the fallback picks the NEWEST
 * document on the case: preparing a TVCC vigilance copy and then recording the
 * submission (adjacent controls in the Submit panel) would otherwise email the
 * ward officer the vigilance complaint about their own division, under a covering
 * note reading "please find attached the complaint letter". That is precisely the
 * harm lib/mail/routing.ts exists to prevent, and routing.ts gates only the
 * triggering kind — not attachment selection. A letter of one of those kinds can
 * still be attached, but only when letterKind explicitly maps to it below.
 */
const FALLBACK_DOC_TYPES = [
  "Generated complaint letter (PDF)",
  "Generated complaint letter",
  "Reminder letter",
  "Counter-reply",
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

/** Every document_type worth querying for a given letterKind: its own
 *  preferred types plus the safe fallback set — exported so a caller building
 *  the query (resolveAttachmentPreview below) uses the identical candidate
 *  list loadAttachment does, rather than a second copy that could drift. */
export function attachmentCandidateTypes(letterKind: string): string[] {
  return [...new Set([...preferredDocTypes(letterKind), ...FALLBACK_DOC_TYPES])];
}

interface AttachmentCandidateRow {
  id: string;
  document_type: string | null;
  original_file_name: string | null;
  mime_type: string | null;
}

/**
 * Pick the best-matching row among a complaint's candidate documents for a
 * given letterKind — the exact selection loadAttachment uses to build the
 * real attachment, pulled out so a "here's what will actually be attached"
 * preview (shown before sending) can never disagree with what sending itself
 * does. `matchedKind: false` means nothing of the REQUESTED kind exists yet
 * and this is the fallback (newest letter of any kind) that would attach
 * instead — worth surfacing to the user rather than silently substituting.
 */
export function pickAttachmentRow<T extends AttachmentCandidateRow>(
  rows: readonly T[],
  letterKind: string,
): { row: T; matchedKind: boolean } | null {
  const isPdf = (r: T) => (r.mime_type ?? "").includes("pdf");
  for (const wanted of preferredDocTypes(letterKind)) {
    const matches = rows.filter((r) => r.document_type === wanted);
    const doc = matches.find(isPdf) ?? matches[0];
    if (doc) return { row: doc, matchedKind: true };
  }
  const fallback = rows.find(isPdf) ?? rows[0];
  return fallback ? { row: fallback, matchedKind: false } : null;
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
  /** The background job driving this send. Supplying it makes a retry idempotent
   *  — see the guard at the top of sendLetterEmail. */
  jobId?: string | null;
  /**
   * Recipients chosen or typed by a user. When this holds at least one valid
   * address it REPLACES directory resolution entirely — which is the point: the
   * directory frequently has no email for the responsible officer (wards outside
   * the imported ARO range, unassigned cases), and a letter should still be
   * sendable to an address the user knows.
   *
   * These are intent, not delivery. They flow into the IntendedEnvelope and pass
   * through applyRedirect like anything else, so test mode still diverts them.
   */
  toOverride?: ManualRecipient[] | null;
  ccOverride?: ManualRecipient[] | null;
}

/** An address a user picked from the directory or typed in by hand. */
export interface ManualRecipient {
  name?: string | null;
  /** "Executive Engineer", "Chief Engineer (Road Infrastructure)" … Used for the
   *  formal salutation ("To, The Executive Engineer"), which is how these letters
   *  are addressed — a bare personal name reads wrong on official correspondence. */
  designation?: string | null;
  email: string;
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
  /** The SMTP reply code, when the failure carried one. Authoritative for
   *  retryability — see lib/mail/smtp-errors.ts. */
  responseCode?: number | null;
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
): Promise<{ filename: string; content: Buffer; documentId: string; contentType: string } | null> {
  try {
    let doc: DocRow | null = null;

    if (documentId) {
      const { data } = await admin
        .from("complaint_documents")
        .select("id, document_type, original_file_name, storage_bucket, storage_path, mime_type")
        .eq("id", documentId)
        // Scoped to the complaint as well as the id: this runs on the admin
        // client, so RLS is not a backstop, and a mismatched pair would email one
        // case's document to another case's officer.
        .eq("complaint_id", complaintId)
        .maybeSingle();
      doc = (data as DocRow | null) ?? null;
    } else {
      // Query the types this letter kind maps to, plus the safe fallback set —
      // never every letter type on the case.
      const candidates = attachmentCandidateTypes(letterKind);
      const { data } = await admin
        .from("complaint_documents")
        .select("id, document_type, original_file_name, storage_bucket, storage_path, mime_type")
        .eq("complaint_id", complaintId)
        .in("document_type", candidates)
        .order("created_at", { ascending: false });
      // Defence in depth: re-apply the allowlist in memory so the guarantee does
      // not rest solely on the query being right.
      const rows = ((data as DocRow[] | null) ?? []).filter(
        (r) => r.document_type != null && candidates.includes(r.document_type),
      );
      doc = pickAttachmentRow(rows, letterKind)?.row ?? null;
    }

    if (!doc) return null;

    // Declare the type the file actually is. A forensic import can yield the DOCX
    // with no PDF sibling, and labelling that "application/pdf" makes Gmail and
    // Outlook show a PDF icon and fail to preview it.
    const contentType = doc.mime_type?.trim() || "application/pdf";
    const ext = contentType.includes("wordprocessingml") ? "docx" : contentType.includes("pdf") ? "pdf" : "bin";
    const filename = doc.original_file_name?.trim() || `${doc.document_type ?? "letter"}.${ext}`;

    if (doc.storage_bucket === R2_STORAGE_SENTINEL) {
      const content = await downloadFromR2ByKey(doc.storage_path);
      return content ? { filename, content, documentId: doc.id, contentType } : null;
    }

    // Supabase Storage fallback (pre-R2 documents).
    const url = await getSignedUrl(doc.storage_bucket, doc.storage_path, 300);
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    return { filename, content: Buffer.from(await res.arrayBuffer()), documentId: doc.id, contentType };
  } catch (e) {
    console.warn("[mail] attachment load failed", complaintId, documentId, e);
    return null;
  }
}

export interface AttachmentPreview {
  documentId: string;
  filename: string;
  documentType: string | null;
  createdAt: string | null;
  /** false when nothing of the REQUESTED letterKind exists yet on this case,
   *  and this is the fallback (newest letter of any kind) that would attach
   *  instead if sent right now. */
  matchedKind: boolean;
}

/**
 * "If I send this now, which stored letter actually goes out?" — read-only,
 * no byte download, for the letter-email panel's kind picker to show BEFORE
 * the user commits to sending. Runs the identical query+selection
 * loadAttachment's null-documentId branch does (attachmentCandidateTypes +
 * pickAttachmentRow), so this can never show one letter while sending
 * attaches another.
 */
export async function resolveAttachmentPreview(
  admin: SupabaseClient,
  complaintId: string,
  letterKind: string,
): Promise<AttachmentPreview | null> {
  const candidates = attachmentCandidateTypes(letterKind);
  const { data } = await admin
    .from("complaint_documents")
    .select("id, document_type, original_file_name, mime_type, created_at")
    .eq("complaint_id", complaintId)
    .in("document_type", candidates)
    .order("created_at", { ascending: false });
  const rows = ((data as (AttachmentCandidateRow & { created_at: string })[] | null) ?? []).filter(
    (r) => r.document_type != null && candidates.includes(r.document_type),
  );
  const picked = pickAttachmentRow(rows, letterKind);
  if (!picked) return null;
  const { row, matchedKind } = picked;
  const contentType = row.mime_type?.trim() || "application/pdf";
  const ext = contentType.includes("wordprocessingml") ? "docx" : contentType.includes("pdf") ? "pdf" : "bin";
  return {
    documentId: row.id,
    filename: row.original_file_name?.trim() || `${row.document_type ?? "letter"}.${ext}`,
    documentType: row.document_type,
    createdAt: (row as { created_at?: string }).created_at ?? null,
    matchedKind,
  };
}

export async function sendLetterEmail(
  admin: SupabaseClient,
  input: SendLetterEmailInput,
): Promise<SendLetterEmailResult> {
  const config = getMailConfig();
  const letterKind = input.letterKind?.trim() || "Complaint letter";

  // ── Idempotency guard ────────────────────────────────────────────────────
  // Gmail can accept the message and then drop the connection before nodemailer
  // reads the 250, which surfaces as a retryable error for a send that actually
  // happened. Without this check each retry delivers another copy to the same
  // official. Cheap: one indexed lookup per send.
  if (input.jobId) {
    const { data: already } = await admin
      .from("letter_emails")
      .select("id, to_addresses, redirected")
      .eq("job_id", input.jobId)
      .eq("status", "sent")
      .maybeSingle();
    const prior = already as { id: string; to_addresses: string[] | null; redirected: boolean } | null;
    if (prior) {
      console.warn(`[mail] job ${input.jobId} already delivered (outbox ${prior.id}) — not re-sending`);
      return {
        ok: true,
        outboxId: prior.id,
        status: "sent",
        to: prior.to_addresses ?? [],
        redirected: Boolean(prior.redirected),
      };
    }
  }

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

  // Explicit recipients win over the directory. Resolution is skipped entirely in
  // that case — it would only produce a reason string nobody needs.
  const manualTo = (input.toOverride ?? []).filter((r) => isValidEmail(r.email));
  const manualCc = (input.ccOverride ?? []).filter((r) => isValidEmail(r.email));
  const directory = manualTo.length ? null : await resolveComplaintEmailRecipients(admin, input.complaintId);

  const recipients = manualTo.length
    ? {
        to: normalizeAddressList(manualTo.map((r) => r.email)),
        cc: normalizeAddressList(manualCc.map((r) => r.email)),
        // A name only makes sense in the salutation when there is ONE addressee;
        // with several, the letter opens generically rather than naming one of them.
        officerName: manualTo.length === 1 ? (manualTo[0]!.name?.trim() || null) : null,
        officerDesignation: manualTo.length === 1 ? (manualTo[0]!.designation?.trim() || null) : null,
        // Not a directory contact, so no FK to record.
        officerId: null,
        reason: null as string | null,
      }
    : {
        to: directory!.to,
        cc: normalizeAddressList([...directory!.cc, ...manualCc.map((r) => r.email)]),
        officerName: directory!.officerName,
        officerDesignation: directory!.officerDesignation,
        officerId: directory!.officerId,
        reason: directory!.reason,
      };

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
      job_id: input.jobId ?? null,
      // Names alongside the addresses — a bare gmail address with no officer_id is
      // unreadable as an audit record a year later.
      recipients: [
        ...manualTo.map((r) => ({
          name: r.name?.trim() || null,
          designation: r.designation?.trim() || null,
          email: r.email.trim().toLowerCase(),
          source: "manual",
          role: "to",
        })),
        ...manualCc.map((r) => ({
          name: r.name?.trim() || null,
          designation: r.designation?.trim() || null,
          email: r.email.trim().toLowerCase(),
          source: "manual",
          role: "cc",
        })),
        ...(manualTo.length
          ? []
          : recipients.to.map((email) => ({
              name: recipients.officerName,
              designation: recipients.officerDesignation,
              email,
              source: "directory",
              role: "to",
            }))),
      ],
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
        ? [{ filename: attachment.filename, content: attachment.content, contentType: attachment.contentType }]
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
    // nodemailer attaches the SMTP reply code — far more reliable for deciding
    // retryability than parsing the prose, so surface it to the caller.
    const responseCode = (e as { responseCode?: number }).responseCode ?? null;
    if (outboxId) {
      await admin.from("letter_emails").update({ status: "failed", error: message }).eq("id", outboxId);
    }
    console.warn("[mail] send failed", input.complaintId, message);
    return {
      ok: false,
      outboxId,
      status: "failed",
      to: envelope.to,
      redirected: envelope.redirected,
      error: message,
      responseCode,
    };
  }
}
