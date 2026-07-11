"use server";

/**
 * Server actions for the bulk ACKNOWLEDGMENT RECONCILIATION review + commit.
 * The heavy lifting (render/OCR/detect/match) runs in lib/complaints/ack-runner.ts;
 * these actions serve the review UI: load a batch, let a human adjust boundaries
 * and matches, and finally attach each confirmed acknowledgment to its complaint.
 */
import { revalidatePath } from "next/cache";
import { requireRole, AuthorizationError, type SessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";
import { getR2SignedUrl, downloadFromR2, deleteFromR2 } from "@/lib/storage/r2-upload";
import { extractPdfPages } from "@/lib/pdf/merge";
import { analyzeComplaintIntake } from "@/lib/ai/complaint-intake-analyzer";
import { scoreAckMatch, loadComplaintPool, loadAcknowledgedComplaintIds } from "@/lib/complaints/ack-matcher";
import { attachAcknowledgmentDocument } from "@/lib/complaints/ack-attach";
import { extractJobCode } from "@/lib/ifms/downloader";
import { getComplaintSettings } from "@/lib/settings";
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
  match_evidence: { candidates?: MatchCandidate[]; alreadyAcknowledged?: boolean } | null;
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
        alreadyAcknowledged: it.match_evidence?.alreadyAcknowledged ?? false,
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

interface AckItemForAttach {
  id: string;
  page_start: number;
  page_end: number;
  ocr_text: string | null;
  extracted: Record<string, unknown> | null;
}

/**
 * Attach one section's PDF page range to its assigned complaint: carve the
 * range out of the preserved original PDF, hand it to
 * attachAcknowledgmentDocument (uploads it, stamps acknowledgment_date/
 * status/escalation clock, writes the timeline entry), then mark the section
 * committed. Shared by commitAckBatchAction (loops over every confirmed
 * section in a batch) and createComplaintFromAckItemAction (attaches the ONE
 * section immediately after creating/linking its complaint). Never throws —
 * a failed attach shouldn't unwind a caller that has other work to keep
 * going (the rest of a commit loop) or a DB write it wants to keep regardless
 * (a complaint just created for this exact section).
 */
async function attachOneAckItem(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    item: AckItemForAttach;
    complaintId: string;
    original: Buffer;
    originalUrl: string;
    originalName: string | null;
    userId: string;
  },
): Promise<{ ok: true; documentId: string } | { ok: false; error: string }> {
  try {
    const { pdf } = await extractPdfPages(args.original, args.item.page_start, args.item.page_end);
    const fileName = `acknowledgment-pp${args.item.page_start}-${args.item.page_end}.pdf`;
    const { documentId } = await attachAcknowledgmentDocument(admin, {
      complaintId: args.complaintId,
      buffer: pdf,
      fileName,
      mimeType: "application/pdf",
      ocrText: args.item.ocr_text,
      extracted: args.item.extracted,
      sourceOriginalPath: args.originalUrl,
      sourceOriginalName: args.originalName,
      sourcePageStart: args.item.page_start,
      sourcePageEnd: args.item.page_end,
      userId: args.userId,
      timelineTitle: "Acknowledgment attached from bulk scan",
      timelineSummary: `Pages ${args.item.page_start}–${args.item.page_end} of ${args.originalName ?? "the scanned batch"}`,
    });
    await admin.from("ack_import_items").update({ decision: "committed", attached_document_id: documentId }).eq("id", args.item.id);
    return { ok: true, documentId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not attach the acknowledgment." };
  }
}

/**
 * Resolve an UNMATCHED acknowledgment straight from its extracted fields —
 * link it to the complaint that already carries its job code, or create a
 * brand-new one when none does — and attach the acknowledgment's own PDF
 * pages to that complaint IN THE SAME STEP. No separate Confirm + batch-level
 * Attach round-trip: this is the direct path for the "job code is clearly on
 * the page, but nothing in the system carries it yet" case that scoreAckMatch
 * deliberately refuses to fuzzy-guess for (see ack-matcher.ts). A brand-new
 * complaint is created bare — no document at creation time — but the ack
 * itself lands on it moments later via the same attachOneAckItem tail
 * commitAckBatchAction uses.
 *
 * Guards against duplicates: `complaints.job_number` carries no DB uniqueness
 * (several complaints can legitimately share one job code — work-splitting),
 * so this re-checks the LIVE complaint pool (not the batch's possibly-stale
 * match data) for the same canonical job code before inserting. A sibling
 * section earlier in this same batch — or a totally different import — may
 * have already created the complaint this one belongs to; if so, link (and
 * attach) to it instead of creating a duplicate — unless it already carries
 * an acknowledgment, in which case this section is marked skipped instead of
 * double-attaching. Several existing complaints sharing the code is left for
 * the human to resolve via search — there's no safe way to auto-pick one.
 */
export async function createComplaintFromAckItemAction(itemId: string): Promise<{
  ok: boolean;
  complaintId?: string;
  caseNumber?: string;
  linkedExisting?: boolean;
  attached?: boolean;
  alreadyAcknowledged?: boolean;
  error?: string;
}> {
  let user: SessionUser;
  try {
    user = await requireRole(COMPLAINT_FIELD_ROLES);
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const admin = createAdminClient();
  const { data: item } = await admin
    .from("ack_import_items")
    .select("id, batch_id, page_start, page_end, ocr_text, extracted, assigned_complaint_id")
    .eq("id", itemId)
    .single();
  if (!item) return { ok: false, error: "Section not found." };
  const row = item as {
    batch_id: string; page_start: number; page_end: number; ocr_text: string | null;
    extracted: Record<string, unknown> | null; assigned_complaint_id: string | null;
  };
  if (row.assigned_complaint_id) return { ok: false, error: "This acknowledgment is already linked to a complaint." };

  // Carves this section's pages out of the batch's preserved original PDF and
  // attaches them to `targetComplaintId` — called once we know WHERE to attach
  // (either branch below), never before, so a blocked/errored path never
  // downloads the PDF for nothing.
  async function attachThisItem(targetComplaintId: string): Promise<boolean> {
    const { data: batchRow } = await admin
      .from("ack_import_batches")
      .select("original_storage_path, original_name")
      .eq("id", row.batch_id)
      .single();
    const originalUrl = (batchRow as { original_storage_path?: string } | null)?.original_storage_path;
    const originalName = (batchRow as { original_name?: string } | null)?.original_name ?? null;
    if (!originalUrl) return false;
    const original = await downloadFromR2(originalUrl);
    if (!original) return false;
    const r = await attachOneAckItem(admin, {
      item: { id: itemId, page_start: row.page_start, page_end: row.page_end, ocr_text: row.ocr_text, extracted: row.extracted },
      complaintId: targetComplaintId,
      original,
      originalUrl,
      originalName,
      userId: user.id,
    });
    if (!r.ok) console.error("[createComplaintFromAckItemAction] attach failed", targetComplaintId, r.error);
    return r.ok;
  }

  const ex = (row.extracted ?? {}) as Record<string, unknown>;
  const exJob = extractJobCode(ex.jobNumber) || extractJobCode(ex.referenceNumber);

  if (exJob) {
    const pool = await loadComplaintPool(admin);
    const dupes = pool.filter((c) => extractJobCode(c.job_number) === exJob);
    if (dupes.length === 1) {
      const linkedId = dupes[0]!.id;
      const acked = await loadAcknowledgedComplaintIds(admin, [linkedId]);
      if (acked.has(linkedId)) {
        await admin.from("ack_import_items").update({ assigned_complaint_id: linkedId, decision: "skipped" }).eq("id", itemId);
        revalidatePath("/complaints/acknowledgments");
        return { ok: true, complaintId: linkedId, linkedExisting: true, alreadyAcknowledged: true };
      }
      await admin.from("ack_import_items").update({ assigned_complaint_id: linkedId, decision: "confirmed" }).eq("id", itemId);
      const attached = await attachThisItem(linkedId);
      revalidatePath("/complaints");
      revalidatePath("/complaints/acknowledgments");
      return { ok: true, complaintId: linkedId, linkedExisting: true, attached };
    }
    if (dupes.length > 1) {
      return {
        ok: false,
        error: `${dupes.length} existing complaints already carry job code ${exJob} — search and link one of those instead of creating a new one.`,
      };
    }
  }

  const settings = await getComplaintSettings();
  const year = new Date().getFullYear();
  const { data: rpc, error: rpcError } = await admin.rpc("next_complaint_case_number", {
    p_prefix: settings.caseNumberPrefix || "DM-CMP",
    p_year: year,
  });
  if (rpcError || !rpc) return { ok: false, error: `Could not generate a case number: ${rpcError?.message ?? "unknown error"}` };
  const caseNumber = rpc as string;

  const subject = String(ex.subject || "").trim();
  const refNumber = String(ex.referenceNumber || "").trim();
  const title = (subject || (exJob ? `Untitled complaint — job ${exJob}` : "Untitled complaint (from acknowledgment)")).slice(0, 300);

  const { data: comp, error } = await admin
    .from("complaints")
    .insert({
      title,
      type: "Other",
      status: "Draft",
      priority: "Medium",
      job_number: exJob || null,
      complaint_number: refNumber || null,
      internal_case_number: caseNumber,
      location: ex.areaOrWard ? String(ex.areaOrWard) : null,
      reporter_name: ex.reporterName ? String(ex.reporterName) : null,
      description:
        "Created from an unmatched acknowledgment during bulk reconciliation — no original complaint letter on file; verify and complete details.",
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();
  if (error || !comp) return { ok: false, error: error?.message ?? "Could not create the complaint." };
  const complaintId = comp.id as string;

  await admin.from("complaint_timeline").insert({
    complaint_id: complaintId,
    event_type: "Created",
    title: "Complaint created from an unmatched acknowledgment",
    summary: `${caseNumber} — created during bulk acknowledgment reconciliation.`,
    created_by: user.id,
  });
  await admin.from("ack_import_items").update({ assigned_complaint_id: complaintId, decision: "confirmed" }).eq("id", itemId);
  const attached = await attachThisItem(complaintId);

  revalidatePath("/complaints");
  revalidatePath("/complaints/acknowledgments");
  return { ok: true, complaintId, caseNumber, attached };
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
  const ackedIds = await loadAcknowledgedComplaintIds(admin, pool.map((c) => c.id));
  console.log(`[rematchAckBatch] batch=${batchId} items=${items.length} pool=${pool.length} poolJobCodes=${poolJobCodes.size}`);

  let matched = 0;
  for (const it of items) {
    const ex = (it.extracted ?? {}) as Record<string, unknown>;
    const exJob = extractJobCode(ex.jobNumber) || extractJobCode(ex.referenceNumber);
    const match = scoreAckMatch(ex as Parameters<typeof scoreAckMatch>[0], pool);
    const isAcked = match.proposedComplaintId ? ackedIds.has(match.proposedComplaintId) : false;
    // Ground-truth diagnostic: the exact extracted job value (JSON-quoted so any
    // hidden dash/space shows), its canonical form, whether the pool has it, and
    // the resulting confidence. This is what tells us the real cause in prod.
    console.log(
      `[rematchAckBatch] item=${it.id} rawJob=${JSON.stringify(ex.jobNumber ?? null)} ` +
        `canon=${JSON.stringify(exJob)} inPool=${exJob ? poolJobCodes.has(exJob) : false} acked=${isAcked} ` +
        `-> ${match.confidence} proposed=${match.proposedComplaintId ?? "none"}`,
    );
    const patch: Record<string, unknown> = {
      proposed_complaint_id: match.proposedComplaintId,
      match_confidence: match.confidence,
      match_evidence: { candidates: match.candidates, alreadyAcknowledged: isAcked },
    };
    // Only touch a still-pending item's assignment/decision — never stomp a
    // human choice. An already-acknowledged match is skipped, not proposed.
    if (it.decision === "pending") {
      patch.assigned_complaint_id = match.proposedComplaintId;
      if (isAcked) patch.decision = "skipped";
    }
    await admin.from("ack_import_items").update(patch).eq("id", it.id);
    if (match.proposedComplaintId && !isAcked) matched++;
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
export async function commitAckBatchAction(batchId: string): Promise<{ ok: boolean; attached?: number; skippedDuplicate?: number; error?: string }> {
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

  // Defensive duplicate guard: never attach a second acknowledgment to a
  // complaint that already has one — including one attached earlier in THIS
  // same commit (seed from the DB, then add each as we attach).
  const acknowledged = await loadAcknowledgedComplaintIds(admin, attachable.map((it) => it.assigned_complaint_id!));
  let attached = 0;
  let skippedDuplicate = 0;
  for (const it of attachable) {
    const complaintId = it.assigned_complaint_id!;
    if (acknowledged.has(complaintId)) {
      // Already acknowledged — mark this section skipped instead of duplicating.
      await admin.from("ack_import_items").update({ decision: "skipped" }).eq("id", it.id);
      skippedDuplicate++;
      continue;
    }
    const r = await attachOneAckItem(admin, {
      item: it,
      complaintId,
      original,
      originalUrl,
      originalName,
      userId: user.id,
    });
    if (r.ok) {
      acknowledged.add(complaintId); // so a later item for the same complaint is skipped
      attached++;
    } else {
      console.error("[commitAckBatchAction] attach failed", complaintId, r.error);
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
  const dupNote = skippedDuplicate ? ` Skipped ${skippedDuplicate} already-acknowledged.` : "";
  await admin
    .from("ack_import_batches")
    .update({
      status: done ? "committed" : "review",
      stage: done ? "Committed" : "Ready for review",
      message: `Attached ${attached} acknowledgment(s).${dupNote}`,
      ...(done ? { finished_at: new Date().toISOString() } : {}),
    })
    .eq("id", batchId);

  revalidatePath("/complaints");
  revalidatePath(`/complaints/acknowledgments/${batchId}`);
  return { ok: true, attached, skippedDuplicate };
}

/** Core delete of one batch (DB row + cascaded items + its R2 files). No auth/
 *  revalidate here — shared by the single-batch and clear-completed actions. */
async function deleteOneAckBatch(admin: ReturnType<typeof createAdminClient>, batchId: string): Promise<{ ok: boolean; error?: string }> {
  // 1. Fetch batch info for deletion from R2
  const { data: batch } = await admin
    .from("ack_import_batches")
    .select("original_storage_path")
    .eq("id", batchId)
    .single();

  const originalUrl = (batch as { original_storage_path?: string } | null)?.original_storage_path;

  // 2. Fetch items thumb paths to clean up thumbnail files in R2
  const { data: items } = await admin
    .from("ack_import_items")
    .select("thumb_paths")
    .eq("batch_id", batchId);

  // 3. Delete from DB (cascade deletes items)
  const { error: dErr } = await admin.from("ack_import_batches").delete().eq("id", batchId);
  if (dErr) {
    return { ok: false, error: dErr.message };
  }

  // 4. Delete files from R2 (best-effort — the DB row is already gone)
  if (originalUrl) {
    await deleteFromR2(originalUrl).catch(() => {});
  }
  if (items && items.length > 0) {
    for (const item of items) {
      const paths = (item as { thumb_paths?: string[] | null })?.thumb_paths;
      if (paths && Array.isArray(paths)) {
        for (const path of paths) {
          await deleteFromR2(path).catch(() => {});
        }
      }
    }
  }
  return { ok: true };
}

/** Delete a reconciliation batch, its items, and its R2 files. */
export async function deleteAckBatchAction(batchId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireRole(COMPLAINT_FIELD_ROLES);
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const admin = createAdminClient();
  const res = await deleteOneAckBatch(admin, batchId);
  if (!res.ok) return res;

  revalidatePath("/complaints");
  revalidatePath("/complaints/acknowledgments");
  return { ok: true };
}

/** Delete every FINISHED batch (committed or failed) — clears history, leaves
 *  anything still processing/in-review untouched. */
export async function clearCompletedAckBatchesAction(): Promise<{ ok: boolean; cleared?: number; error?: string }> {
  try {
    await requireRole(COMPLAINT_FIELD_ROLES);
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("ack_import_batches")
    .select("id")
    .in("status", ["committed", "failed"]);
  if (error) return { ok: false, error: error.message };
  const ids = (rows ?? []).map((r) => (r as { id: string }).id);
  if (ids.length === 0) return { ok: true, cleared: 0 };

  let cleared = 0;
  for (const id of ids) {
    const res = await deleteOneAckBatch(admin, id);
    if (res.ok) cleared++;
  }

  revalidatePath("/complaints");
  revalidatePath("/complaints/acknowledgments");
  return { ok: true, cleared };
}
