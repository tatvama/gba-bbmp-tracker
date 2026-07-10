"use server";

/**
 * Server actions for the bulk ACKNOWLEDGMENT RECONCILIATION review + commit.
 * The heavy lifting (render/OCR/detect/match) runs in lib/complaints/ack-runner.ts;
 * these actions serve the review UI: load a batch, let a human adjust boundaries
 * and matches, and finally attach each confirmed acknowledgment to its complaint.
 */
import { revalidatePath } from "next/cache";
import { requireRole, AuthorizationError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";
import { getR2SignedUrl, downloadFromR2 } from "@/lib/storage/r2-upload";
import { extractPdfPages } from "@/lib/pdf/merge";
import { analyzeComplaintIntake } from "@/lib/ai/complaint-intake-analyzer";
import { scoreAckMatch, loadComplaintPool } from "@/lib/complaints/ack-matcher";
import { attachAcknowledgmentDocument } from "@/lib/complaints/ack-attach";
import { extractJobCode } from "@/lib/ifms/downloader";
import {
  ackThumbKey,
  type AckBatchView,
  type AckBatchStatus,
  type AckBatchListRow,
  type AckDecision,
  type AckReviewItem,
  type ComplaintSummary,
  type MatchCandidate,
  type MatchConfidence,
} from "@/lib/complaints/ack-reconcile";

const COMPLAINT_SUMMARY_COLS = "id, internal_case_number, complaint_number, job_number, title, location, status";

/** Recent acknowledgment batches (most recent first) for the index page. */
export async function listAckBatchesAction(limit = 30): Promise<AckBatchListRow[]> {
  try {
    await requireRole(COMPLAINT_FIELD_ROLES);
  } catch {
    return [];
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from("ack_import_batches")
    .select("id, status, original_name, page_count, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  const batches = (data ?? []) as { id: string; status: AckBatchStatus; original_name: string | null; page_count: number; created_at: string }[];
  if (batches.length === 0) return [];

  // Item + committed counts per batch (small N — one grouped read each is fine).
  const rows: AckBatchListRow[] = [];
  for (const b of batches) {
    const { count: itemCount } = await admin
      .from("ack_import_items")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", b.id);
    const { count: committedCount } = await admin
      .from("ack_import_items")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", b.id)
      .eq("decision", "committed");
    rows.push({
      id: b.id,
      status: b.status,
      originalName: b.original_name,
      pageCount: b.page_count,
      itemCount: itemCount ?? 0,
      committedCount: committedCount ?? 0,
      createdAt: b.created_at,
    });
  }
  return rows;
}

interface ComplaintRow {
  id: string;
  internal_case_number: string | null;
  complaint_number: string | null;
  job_number: string | null;
  title: string | null;
  location: string | null;
  status: string | null;
}

function toSummary(r: ComplaintRow): ComplaintSummary {
  return {
    id: r.id,
    caseNumber: r.internal_case_number,
    complaintNumber: r.complaint_number,
    jobNumber: r.job_number,
    title: r.title,
    location: r.location,
    status: r.status,
  };
}

interface AckItemRow {
  id: string;
  sort_order: number;
  page_start: number;
  page_end: number;
  ocr_text: string | null;
  extracted: Record<string, unknown> | null;
  thumb_paths: string[] | null;
  proposed_complaint_id: string | null;
  match_confidence: MatchConfidence;
  match_evidence: { candidates?: MatchCandidate[] } | null;
  assigned_complaint_id: string | null;
  decision: AckDecision;
  attached_document_id: string | null;
}

/** Load a batch + all its items, resolving complaint summaries and signing thumbs.
 *  Returns `{ batch }` on success — a distinct key from `{ error }` so callers can
 *  narrow the union (AckBatchView itself carries an `error` field). */
export async function getAckBatchAction(batchId: string): Promise<{ batch: AckBatchView } | { error: string }> {
  try {
    await requireRole(COMPLAINT_FIELD_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const admin = createAdminClient();
  const { data: batch, error: bErr } = await admin
    .from("ack_import_batches")
    .select("id, status, stage, message, error, original_name, page_count, processed_pages")
    .eq("id", batchId)
    .single();
  if (bErr || !batch) return { error: "Batch not found." };

  const { data: rows } = await admin
    .from("ack_import_items")
    .select(
      "id, sort_order, page_start, page_end, ocr_text, extracted, thumb_paths, proposed_complaint_id, match_confidence, match_evidence, assigned_complaint_id, decision, attached_document_id",
    )
    .eq("batch_id", batchId)
    .order("sort_order", { ascending: true })
    .order("page_start", { ascending: true });
  const items = (rows ?? []) as AckItemRow[];

  // Resolve the complaints referenced by proposals/assignments in one query.
  const ids = new Set<string>();
  for (const it of items) {
    if (it.proposed_complaint_id) ids.add(it.proposed_complaint_id);
    if (it.assigned_complaint_id) ids.add(it.assigned_complaint_id);
  }
  const summaryMap = new Map<string, ComplaintSummary>();
  if (ids.size) {
    const { data: comps } = await admin.from("complaints").select(COMPLAINT_SUMMARY_COLS).in("id", [...ids]);
    for (const c of (comps ?? []) as ComplaintRow[]) summaryMap.set(c.id, toSummary(c));
  }

  const reviewItems: AckReviewItem[] = await Promise.all(
    items.map(async (it) => {
      const thumbUrls = await Promise.all(
        (it.thumb_paths ?? []).map((k) => getR2SignedUrl(k, 3600).catch(() => "")),
      );
      return {
        id: it.id,
        sortOrder: it.sort_order,
        pageStart: it.page_start,
        pageEnd: it.page_end,
        extracted: (it.extracted ?? {}) as AckReviewItem["extracted"],
        thumbUrls: thumbUrls.filter(Boolean),
        proposedComplaintId: it.proposed_complaint_id,
        matchConfidence: it.match_confidence,
        candidates: it.match_evidence?.candidates ?? [],
        assignedComplaintId: it.assigned_complaint_id,
        decision: it.decision,
        attachedDocumentId: it.attached_document_id,
        proposed: it.proposed_complaint_id ? summaryMap.get(it.proposed_complaint_id) ?? null : null,
        assigned: it.assigned_complaint_id ? summaryMap.get(it.assigned_complaint_id) ?? null : null,
        ocrText: it.ocr_text,
      };
    }),
  );

  const b = batch as {
    id: string; status: AckBatchStatus; stage: string | null; message: string | null;
    error: string | null; original_name: string | null; page_count: number; processed_pages: number;
  };
  return {
    batch: {
      id: b.id,
      status: b.status,
      stage: b.stage,
      message: b.message,
      error: b.error,
      originalName: b.original_name,
      pageCount: b.page_count,
      processedPages: b.processed_pages,
      items: reviewItems,
    },
  };
}

/** Update one section: reassign the complaint, edit its page range, or set its
 *  decision (confirm / skip / reset to pending). Recomputes thumbnails on a range
 *  change so the strip stays correct. */
export async function updateAckItemAction(input: {
  itemId: string;
  assignedComplaintId?: string | null;
  pageStart?: number;
  pageEnd?: number;
  decision?: AckDecision;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireRole(COMPLAINT_FIELD_ROLES);
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const admin = createAdminClient();
  const { data: item } = await admin
    .from("ack_import_items")
    .select("batch_id, page_start, page_end")
    .eq("id", input.itemId)
    .single();
  if (!item) return { ok: false, error: "Section not found." };
  const row = item as { batch_id: string; page_start: number; page_end: number };

  const patch: Record<string, unknown> = {};
  if (input.assignedComplaintId !== undefined) patch.assigned_complaint_id = input.assignedComplaintId;
  if (input.decision !== undefined) patch.decision = input.decision;
  if (input.pageStart !== undefined || input.pageEnd !== undefined) {
    const start = Math.max(1, input.pageStart ?? row.page_start);
    const end = Math.max(start, input.pageEnd ?? row.page_end);
    patch.page_start = start;
    patch.page_end = end;
    const keys: string[] = [];
    for (let p = start; p <= end; p++) keys.push(ackThumbKey(row.batch_id, p));
    patch.thumb_paths = keys;
  }
  const { error } = await admin.from("ack_import_items").update(patch).eq("id", input.itemId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Search existing complaints for the reassign picker (case no / BBMP no / job / title). */
export async function searchComplaintsForMatchAction(query: string): Promise<ComplaintSummary[]> {
  try {
    await requireRole(COMPLAINT_FIELD_ROLES);
  } catch {
    return [];
  }
  const q = (query || "").trim();
  if (q.length < 2) return [];
  const admin = createAdminClient();
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const { data } = await admin
    .from("complaints")
    .select(COMPLAINT_SUMMARY_COLS)
    .or(
      `internal_case_number.ilike.${like},complaint_number.ilike.${like},job_number.ilike.${like},title.ilike.${like},location.ilike.${like}`,
    )
    .limit(20);
  return ((data ?? []) as ComplaintRow[]).map(toSummary);
}

/** Re-run AI extraction + matching for one section (after a boundary edit, or to
 *  retry a poor read). Re-slices OCR from the batch's stored per-page text. */
export async function reextractAckItemAction(itemId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireRole(COMPLAINT_FIELD_ROLES);
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const admin = createAdminClient();
  const { data: item } = await admin
    .from("ack_import_items")
    .select("batch_id, page_start, page_end, decision")
    .eq("id", itemId)
    .single();
  if (!item) return { ok: false, error: "Section not found." };
  const row = item as { batch_id: string; page_start: number; page_end: number; decision: AckDecision };

  const { data: batch } = await admin.from("ack_import_batches").select("page_ocr").eq("id", row.batch_id).single();
  const pageOcr = ((batch as { page_ocr?: Record<string, string> } | null)?.page_ocr ?? {}) as Record<string, string>;
  const parts: string[] = [];
  for (let p = row.page_start; p <= row.page_end; p++) {
    const t = (pageOcr[String(p)] || "").trim();
    parts.push(row.page_end > row.page_start ? `--- Page ${p} ---\n${t}\n` : t);
  }
  const ocrText = parts.join("\n").trim();

  const { extraction } = await analyzeComplaintIntake(ocrText);
  const pool = await loadComplaintPool(admin);
  const match = scoreAckMatch(extraction, pool);

  const patch: Record<string, unknown> = {
    ocr_text: ocrText || null,
    extracted: extraction as unknown as Record<string, unknown>,
    proposed_complaint_id: match.proposedComplaintId,
    match_confidence: match.confidence,
    match_evidence: { candidates: match.candidates },
  };
  // Only auto-fill the assignment while still pending — never stomp a human choice.
  if (row.decision === "pending") patch.assigned_complaint_id = match.proposedComplaintId;
  const { error } = await admin.from("ack_import_items").update(patch).eq("id", itemId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Re-run MATCHING (not extraction) for every item in a batch against the CURRENT
 * complaint pool, using each item's already-stored `extracted` fields. Cheap — no
 * re-upload, no re-OCR, no AI call — so it's the right fix when the batch was
 * processed before the complaint existed, or before a matcher improvement shipped
 * (e.g. job codes transcribed with a Unicode dash now canonicalise and match).
 * Never stomps a human decision: only pending items get their auto-assignment
 * refreshed. Logs a diagnostic per item so production can show WHY a code that is
 * clearly on the page still didn't resolve to a complaint.
 */
export async function rematchAckBatchAction(
  batchId: string,
): Promise<{ ok: boolean; matched?: number; total?: number; error?: string }> {
  try {
    await requireRole(COMPLAINT_FIELD_ROLES);
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("ack_import_items")
    .select("id, extracted, decision")
    .eq("batch_id", batchId);
  const items = (rows ?? []) as { id: string; extracted: Record<string, unknown> | null; decision: AckDecision }[];
  if (items.length === 0) return { ok: false, error: "No acknowledgment sections in this batch." };

  const pool = await loadComplaintPool(admin);
  // How many distinct job codes does the pool actually carry? A telling number:
  // if it's ~0 the pool/query is the problem, not the matcher.
  const poolJobCodes = new Set(pool.map((c) => extractJobCode(c.job_number)).filter(Boolean));
  console.log(`[rematchAckBatch] batch=${batchId} items=${items.length} pool=${pool.length} poolJobCodes=${poolJobCodes.size}`);

  let matched = 0;
  for (const it of items) {
    const ex = (it.extracted ?? {}) as Record<string, unknown>;
    const exJob = extractJobCode(ex.jobNumber) || extractJobCode(ex.referenceNumber);
    const match = scoreAckMatch(ex as Parameters<typeof scoreAckMatch>[0], pool);
    // Ground-truth diagnostic: the exact extracted job value (JSON-quoted so any
    // hidden dash/space shows), its canonical form, whether the pool has it, and
    // the resulting confidence. This is what tells us the real cause in prod.
    console.log(
      `[rematchAckBatch] item=${it.id} rawJob=${JSON.stringify(ex.jobNumber ?? null)} ` +
        `canon=${JSON.stringify(exJob)} inPool=${exJob ? poolJobCodes.has(exJob) : false} ` +
        `-> ${match.confidence} proposed=${match.proposedComplaintId ?? "none"}`,
    );
    const patch: Record<string, unknown> = {
      proposed_complaint_id: match.proposedComplaintId,
      match_confidence: match.confidence,
      match_evidence: { candidates: match.candidates },
    };
    if (it.decision === "pending") patch.assigned_complaint_id = match.proposedComplaintId;
    await admin.from("ack_import_items").update(patch).eq("id", it.id);
    if (match.proposedComplaintId) matched++;
  }

  revalidatePath(`/complaints/acknowledgments/${batchId}`);
  return { ok: true, matched, total: items.length };
}

/** Merge `mergeId` into `primaryId` (adjacent sections) — union the page range,
 *  drop the merged row. The combined section keeps the primary's match; re-extract
 *  afterwards if needed. */
export async function mergeAckItemsAction(primaryId: string, mergeId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireRole(COMPLAINT_FIELD_ROLES);
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  if (primaryId === mergeId) return { ok: false, error: "Cannot merge a section with itself." };
  const admin = createAdminClient();
  const { data } = await admin
    .from("ack_import_items")
    .select("id, batch_id, page_start, page_end")
    .in("id", [primaryId, mergeId]);
  const rows = (data ?? []) as { id: string; batch_id: string; page_start: number; page_end: number }[];
  const primary = rows.find((r) => r.id === primaryId);
  const merge = rows.find((r) => r.id === mergeId);
  if (!primary || !merge) return { ok: false, error: "Sections not found." };
  if (primary.batch_id !== merge.batch_id) return { ok: false, error: "Sections are from different batches." };

  const start = Math.min(primary.page_start, merge.page_start);
  const end = Math.max(primary.page_end, merge.page_end);
  const keys: string[] = [];
  for (let p = start; p <= end; p++) keys.push(ackThumbKey(primary.batch_id, p));

  const { error: uErr } = await admin
    .from("ack_import_items")
    .update({ page_start: start, page_end: end, thumb_paths: keys })
    .eq("id", primaryId);
  if (uErr) return { ok: false, error: uErr.message };
  await admin.from("ack_import_items").delete().eq("id", mergeId);
  return { ok: true };
}

/** Split `itemId` at `atPage` (which becomes the first page of a NEW trailing
 *  section). Both halves are re-extracted + re-matched from stored per-page OCR. */
export async function splitAckItemAction(itemId: string, atPage: number): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireRole(COMPLAINT_FIELD_ROLES);
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const admin = createAdminClient();
  const { data: item } = await admin
    .from("ack_import_items")
    .select("batch_id, sort_order, page_start, page_end")
    .eq("id", itemId)
    .single();
  if (!item) return { ok: false, error: "Section not found." };
  const row = item as { batch_id: string; sort_order: number; page_start: number; page_end: number };
  if (atPage <= row.page_start || atPage > row.page_end) {
    return { ok: false, error: "Split point must be inside the section." };
  }

  const { data: batch } = await admin.from("ack_import_batches").select("page_ocr").eq("id", row.batch_id).single();
  const pageOcr = ((batch as { page_ocr?: Record<string, string> } | null)?.page_ocr ?? {}) as Record<string, string>;
  const pool = await loadComplaintPool(admin);

  const sliceAndMatch = async (start: number, end: number) => {
    const parts: string[] = [];
    for (let p = start; p <= end; p++) {
      const t = (pageOcr[String(p)] || "").trim();
      parts.push(end > start ? `--- Page ${p} ---\n${t}\n` : t);
    }
    const ocrText = parts.join("\n").trim();
    const { extraction } = await analyzeComplaintIntake(ocrText);
    const match = scoreAckMatch(extraction, pool);
    const keys: string[] = [];
    for (let p = start; p <= end; p++) keys.push(ackThumbKey(row.batch_id, p));
    return { ocrText, extraction, match, keys };
  };

  const head = await sliceAndMatch(row.page_start, atPage - 1);
  const tail = await sliceAndMatch(atPage, row.page_end);

  const { error: uErr } = await admin
    .from("ack_import_items")
    .update({
      page_start: row.page_start,
      page_end: atPage - 1,
      ocr_text: head.ocrText || null,
      extracted: head.extraction as unknown as Record<string, unknown>,
      thumb_paths: head.keys,
      proposed_complaint_id: head.match.proposedComplaintId,
      match_confidence: head.match.confidence,
      match_evidence: { candidates: head.match.candidates },
      assigned_complaint_id: head.match.proposedComplaintId,
      decision: "pending",
    })
    .eq("id", itemId);
  if (uErr) return { ok: false, error: uErr.message };

  const { error: iErr } = await admin.from("ack_import_items").insert({
    batch_id: row.batch_id,
    sort_order: row.sort_order,
    page_start: atPage,
    page_end: row.page_end,
    ocr_text: tail.ocrText || null,
    extracted: tail.extraction as unknown as Record<string, unknown>,
    thumb_paths: tail.keys,
    proposed_complaint_id: tail.match.proposedComplaintId,
    match_confidence: tail.match.confidence,
    match_evidence: { candidates: tail.match.candidates },
    assigned_complaint_id: tail.match.proposedComplaintId,
    decision: "pending",
  });
  if (iErr) return { ok: false, error: iErr.message };
  return { ok: true };
}

/**
 * Attach every CONFIRMED section to its assigned complaint: carve the page range
 * out of the preserved original PDF, upload it, insert a "Complaint acknowledgement"
 * document (with page provenance), stamp the complaint's acknowledgment_date, and
 * nudge Draft/Filed complaints to Acknowledged. Idempotent — items already
 * committed are skipped, so a re-run only finishes what's left.
 */
export async function commitAckBatchAction(batchId: string): Promise<{ ok: boolean; attached?: number; error?: string }> {
  let user;
  try {
    user = await requireRole(COMPLAINT_FIELD_ROLES);
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const admin = createAdminClient();

  const { data: batch } = await admin
    .from("ack_import_batches")
    .select("original_storage_path, original_name")
    .eq("id", batchId)
    .single();
  const originalUrl = (batch as { original_storage_path?: string } | null)?.original_storage_path;
  const originalName = (batch as { original_name?: string } | null)?.original_name ?? null;
  if (!originalUrl) return { ok: false, error: "Batch original PDF is missing." };

  const { data: rows } = await admin
    .from("ack_import_items")
    .select("id, page_start, page_end, ocr_text, extracted, assigned_complaint_id")
    .eq("batch_id", batchId)
    .eq("decision", "confirmed")
    .is("attached_document_id", null);
  const items = (rows ?? []) as {
    id: string; page_start: number; page_end: number; ocr_text: string | null;
    extracted: Record<string, unknown> | null; assigned_complaint_id: string | null;
  }[];
  const attachable = items.filter((it) => it.assigned_complaint_id);
  if (attachable.length === 0) return { ok: false, error: "No confirmed acknowledgments with an assigned complaint." };

  await admin.from("ack_import_batches").update({ status: "committing", stage: "Attaching", message: `Attaching ${attachable.length} acknowledgment(s)…` }).eq("id", batchId);

  const original = await downloadFromR2(originalUrl);
  if (!original) {
    await admin.from("ack_import_batches").update({ status: "review", error: "Could not download the original PDF." }).eq("id", batchId);
    return { ok: false, error: "Could not download the original PDF." };
  }

  let attached = 0;
  for (const it of attachable) {
    const complaintId = it.assigned_complaint_id!;
    try {
      const { pdf } = await extractPdfPages(original, it.page_start, it.page_end);
      const fileName = `acknowledgment-pp${it.page_start}-${it.page_end}.pdf`;

      const { documentId } = await attachAcknowledgmentDocument(admin, {
        complaintId,
        buffer: pdf,
        fileName,
        mimeType: "application/pdf",
        ocrText: it.ocr_text,
        extracted: it.extracted,
        sourceOriginalPath: originalUrl,
        sourceOriginalName: originalName,
        sourcePageStart: it.page_start,
        sourcePageEnd: it.page_end,
        userId: user.id,
        timelineTitle: "Acknowledgment attached from bulk scan",
        timelineSummary: `Pages ${it.page_start}–${it.page_end} of ${originalName ?? "the scanned batch"}`,
      });

      await admin.from("ack_import_items").update({ decision: "committed", attached_document_id: documentId }).eq("id", it.id);
      attached++;
    } catch (e) {
      console.error("[commitAckBatchAction] attach failed", complaintId, e);
    }
  }

  // Committed when nothing confirmed-but-unattached remains; else back to review.
  const { count: remaining } = await admin
    .from("ack_import_items")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId)
    .eq("decision", "confirmed")
    .is("attached_document_id", null);
  const done = (remaining ?? 0) === 0;
  await admin
    .from("ack_import_batches")
    .update({
      status: done ? "committed" : "review",
      stage: done ? "Committed" : "Ready for review",
      message: `Attached ${attached} acknowledgment(s).`,
      ...(done ? { finished_at: new Date().toISOString() } : {}),
    })
    .eq("id", batchId);

  revalidatePath("/complaints");
  revalidatePath(`/complaints/acknowledgments/${batchId}`);
  return { ok: true, attached };
}
