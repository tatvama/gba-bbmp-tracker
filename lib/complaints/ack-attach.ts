/**
 * Shared "attach an acknowledgment document to a complaint" tail — everything
 * after the document bytes are in hand: upload to storage, insert
 * `complaint_documents`, stamp `acknowledgment_date`/status/escalation clock,
 * write the timeline entry, and kick off OCR/AI summary. Used by BOTH the bulk
 * scanned-PDF reconciliation commit (lib/actions/ack-import.ts, which already
 * has OCR text from the page-level OCR pass) and the filename-matched fast
 * path (which has no pre-existing OCR text, so it queues a background OCR job
 * instead). Factored out so the acknowledgment-date/status-transition/
 * escalation-clock logic isn't duplicated between the two flows.
 *
 * Plain (non-"use server") module — imported by a "use server" actions file
 * AND a Route Handler, same reason lib/complaints/ack-reconcile.ts is plain.
 */
import "server-only";
import type { DbClient } from "@/lib/db";
import { R2_STORAGE_SENTINEL } from "@/lib/constants";
import { uploadToR2 } from "@/lib/storage/r2-upload";
import { buildPath } from "@/lib/storage/object-store";
import { analyzeDocumentById } from "@/lib/ocr/process-document";
import { isAiConfigured } from "@/lib/ai/provider";
import { startJob } from "@/lib/jobs/runner";
import { computeStageDeadline } from "@/lib/complaints/escalation-cycle";
// Side-effect import: registers the "ocr" job handler (needed when runOcrJob is used).
import "@/lib/jobs/handlers";

export interface AttachAcknowledgmentInput {
  complaintId: string;
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  /** OCR text already available for this exact slice (bulk flow); omit to queue a background OCR job instead. */
  ocrText?: string | null;
  extracted?: Record<string, unknown> | null;
  sourceOriginalPath?: string | null;
  sourceOriginalName?: string | null;
  sourcePageStart?: number | null;
  sourcePageEnd?: number | null;
  userId: string;
  timelineTitle: string;
  timelineSummary: string;
  /** Queue a background OCR job when no ocrText was supplied. */
  runOcrJob?: boolean;
}

export interface AttachAcknowledgmentResult {
  documentId: string;
}

/** Pick the best acknowledgment date from an extraction (first valid ISO date). */
function pickAckDate(extracted: Record<string, unknown>): string | null {
  const dates = extracted?.importantDates;
  if (Array.isArray(dates)) {
    for (const d of dates) {
      const v = (d as { date?: string })?.date;
      if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    }
  }
  return null;
}

/** First non-empty trimmed string among the given keys of an extraction. */
function exStr(extracted: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = extracted?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** The officer/engineer named on the acknowledgment, as free text (never a
 *  contacts lookup): the extracted `officerNames` joined, else the receiver line. */
function exOfficerName(extracted: Record<string, unknown>): string {
  const names = extracted?.officerNames;
  if (Array.isArray(names)) {
    const joined = names.map((n) => (typeof n === "string" ? n.trim() : "")).filter(Boolean).join("; ");
    if (joined) return joined;
  }
  return exStr(extracted, "receiver");
}

/**
 * Upload the document, insert it against the complaint, nudge the complaint's
 * acknowledgment/status/escalation state, and record a timeline entry. Throws
 * on failure — callers decide how to handle/report a failed attach.
 */
export async function attachAcknowledgmentDocument(
  admin: DbClient,
  input: AttachAcknowledgmentInput,
): Promise<AttachAcknowledgmentResult> {
  const path = buildPath(input.complaintId, input.fileName, Date.now(), Math.random().toString(36).slice(2, 8));
  await uploadToR2({ key: path, body: input.buffer, contentType: input.mimeType });

  const wantsOcrJob = !!input.runOcrJob && !input.ocrText;

  const { data: docRow, error: docErr } = await admin
    .from("complaint_documents")
    .insert({
      complaint_id: input.complaintId,
      document_type: "Complaint acknowledgement",
      title: input.fileName,
      original_file_name: input.fileName,
      storage_bucket: R2_STORAGE_SENTINEL,
      storage_path: path,
      mime_type: input.mimeType,
      file_size: input.buffer.byteLength,
      ocr_status: input.ocrText ? "Completed" : wantsOcrJob ? "Queued" : "Skipped",
      ocr_raw_text: input.ocrText ?? null,
      ocr_clean_text: input.ocrText ?? null,
      ocr_language: "eng+kan",
      ai_summary_status: isAiConfigured() && input.ocrText ? "generating" : "none",
      source_page_start: input.sourcePageStart ?? null,
      source_page_end: input.sourcePageEnd ?? null,
      source_original_path: input.sourceOriginalPath ?? null,
      source_original_name: input.sourceOriginalName ?? null,
      uploaded_by: input.userId,
    })
    .select("id")
    .single();
  if (docErr || !docRow) throw new Error(docErr?.message || "Could not insert document.");
  const documentId = docRow.id as string;

  // Stamp acknowledgment_date + nudge status + backfill any complaint fields the
  // acknowledgment reveals (best-effort, FILL-EMPTY-ONLY — never overwrite a
  // value already on the complaint).
  const { data: comp } = await admin
    .from("complaints")
    .select(
      "acknowledgment_date, complaint_number, status, escalation_stage, job_number, reporter_name, location, responsible_department, contractor, ack_officer_name, division_id",
    )
    .eq("id", input.complaintId)
    .single();
  const c = (comp ?? {}) as {
    acknowledgment_date: string | null;
    complaint_number: string | null;
    status: string | null;
    escalation_stage: string | null;
    job_number: string | null;
    reporter_name: string | null;
    location: string | null;
    responsible_department: string | null;
    contractor: string | null;
    ack_officer_name: string | null;
    division_id: string | null;
  };
  const compPatch: Record<string, unknown> = {};
  const ex = input.extracted ?? {};
  const ackDate = pickAckDate(ex);
  // Fields read off the acknowledgment, applied only where the complaint has a gap.
  const filled: string[] = [];
  const fillIfEmpty = (existing: string | null, column: string, value: string, label: string) => {
    if (!existing && value) {
      compPatch[column] = value;
      filled.push(label);
    }
  };
  const exJob = exStr(ex, "jobNumber");
  if (/^\d{3}-\d{2}-\d{6}$/.test(exJob)) fillIfEmpty(c.job_number, "job_number", exJob, "job number");
  fillIfEmpty(c.reporter_name, "reporter_name", exStr(ex, "reporterName", "reporter"), "reporter");
  fillIfEmpty(c.location, "location", exStr(ex, "areaOrWard", "area", "ward"), "location");
  fillIfEmpty(c.responsible_department, "responsible_department", exStr(ex, "department"), "department");
  fillIfEmpty(c.contractor, "contractor", exStr(ex, "contractor"), "contractor");
  fillIfEmpty(c.ack_officer_name, "ack_officer_name", exOfficerName(ex), "officer");
  // Division: resolve the extracted name to a division row, but only when the
  // complaint has none and the name matches EXACTLY ONE division (no guessing).
  if (!c.division_id) {
    const divName = exStr(ex, "division");
    if (divName) {
      const { data: divs } = await admin.from("divisions").select("id").ilike("name", divName).limit(2);
      if (divs && divs.length === 1) {
        compPatch.division_id = divs[0]!.id;
        filled.push("division");
      }
    }
  }
  // Even when OCR/AI couldn't read a date off the page (poor scan, low
  // confidence), the acknowledgment is physically in hand NOW — fall back to
  // today rather than leaving acknowledgment_date (and the no-reply
  // escalation clock below, which is gated on this field) unset forever.
  // Previously a failed extraction meant `status` still flipped to
  // "Acknowledged" but the date/clock silently never got set — a human can
  // correct the date afterward via updateAcknowledgmentDateAction.
  if (!c.acknowledgment_date) compPatch.acknowledgment_date = ackDate || new Date().toISOString().slice(0, 10);
  const exRef = exStr(ex, "referenceNumber");
  if (!c.complaint_number && exRef && !/^\d{3}-\d{2}-\d{6}$/.test(exRef)) {
    compPatch.complaint_number = exRef;
    filled.push("reference number");
  }
  if (c.status === "Draft" || c.status === "Filed") compPatch.status = "Acknowledged";

  // Start the no-reply escalation clock — but only the FIRST time an
  // acknowledgment date lands (never re-arm on a re-attach/duplicate scan).
  if (compPatch.acknowledgment_date && (c.escalation_stage ?? "awaiting_ack") === "awaiting_ack") {
    const { data: awaitingReplyConfig } = await admin
      .from("escalation_flow_configs")
      .select("stage_key, sla_days, sla_unit, on_elapse_draft_kind, on_elapse_next_stage")
      .eq("stage_key", "awaiting_reply")
      .maybeSingle();
    const enteredAt = new Date(`${compPatch.acknowledgment_date}T00:00:00Z`);
    const deadline = awaitingReplyConfig ? computeStageDeadline(enteredAt, awaitingReplyConfig) : null;
    compPatch.escalation_stage = "awaiting_reply";
    compPatch.escalation_stage_entered_at = enteredAt.toISOString();
    compPatch.escalation_stage_deadline = deadline ? deadline.toISOString() : null;
  }

  if (Object.keys(compPatch).length) {
    compPatch.updated_by = input.userId;
    await admin.from("complaints").update(compPatch).eq("id", input.complaintId);
  }

  await admin.from("complaint_timeline").insert({
    complaint_id: input.complaintId,
    event_type: "Acknowledged",
    title: input.timelineTitle,
    summary:
      `${input.timelineSummary}${ackDate ? ` · received ${ackDate}` : ""}` +
      (filled.length ? ` · auto-filled from acknowledgment: ${filled.join(", ")}` : ""),
    related_document_id: documentId,
    created_by: input.userId,
  });

  if (wantsOcrJob) {
    await startJob(admin, {
      type: "ocr",
      title: "OCR",
      entityType: "complaint_document",
      entityId: documentId,
      input: { documentId, analyze: isAiConfigured() },
      userId: input.userId,
    });
  } else if (isAiConfigured() && input.ocrText) {
    void analyzeDocumentById(documentId, { force: true, ensureOcr: false }).catch((e) =>
      console.error("[ack-attach] summary generation failed", e),
    );
  }

  return { documentId };
}
