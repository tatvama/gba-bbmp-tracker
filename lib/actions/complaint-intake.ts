"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireRole, AuthorizationError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMPLAINT_WRITE_ROLES, STORAGE_BUCKETS, R2_STORAGE_SENTINEL } from "@/lib/constants";
import { buildMergedPdf, extractPdfPages } from "@/lib/pdf/merge";
import { pdfRenderer } from "@/lib/pdf/pdf-renderer";
import { runOcr } from "@/lib/ocr/ocr-service";
import { analyzeDocumentById } from "@/lib/ocr/process-document";
import { uploadToR2, downloadFromR2 } from "@/lib/storage/r2-upload";
import { buildPath } from "@/lib/storage/supabase-upload";
import { getComplaintSettings } from "@/lib/settings";
import { isAiConfigured } from "@/lib/ai/provider";
import { detectComplaintLetters } from "@/lib/ai/complaint-letter-detector";
import {
  analyzeComplaintIntakeFromImages,
  COMPLAINT_TYPE_VALUES,
  type ComplaintIntakeExtraction,
} from "@/lib/ai/complaint-intake-analyzer";
import type {
  DetectedComplaint,
  IntakeAnalyzeResult,
  CommitComplaint,
  IntakeCommitResult,
  CreatedComplaintSummary,
} from "@/lib/complaints/multi-intake";

const SAFE_INTAKE_STATUS = new Set(["Draft", "Filed", "Acknowledged", "Reply Received"]);
// Covers multi-complaint bundles; matches the detector's page cap so every page
// we consider for a boundary also has OCR text to slice.
const OCR_PAGE_CAP = 24;

function collectFiles(formData: FormData): File[] {
  let raw = formData.getAll("files");
  if (raw.length === 0) raw = formData.getAll("file");
  return raw.filter(
    (x): x is File => typeof x === "object" && x !== null && typeof (x as { arrayBuffer?: unknown }).arrayBuffer === "function",
  );
}

/**
 * Render each page ONCE and OCR it. Returns the page images (fed to the vision
 * boundary detector) alongside per-page OCR text (sliced per detected complaint).
 */
async function renderAndOcr(pdf: Buffer): Promise<{ pageImages: { buffer: Buffer; mimeType: string }[]; perPage: string[] }> {
  const pages = await pdfRenderer.renderPages(pdf);
  const capped = pages.slice(0, OCR_PAGE_CAP);
  const pageImages = capped.map((p) => ({ buffer: p.buffer, mimeType: p.mimeType }));
  const perPage: string[] = [];
  for (const p of capped) {
    const r = await runOcr({ buffer: p.buffer, mimeType: p.mimeType, language: "eng+kan" });
    perPage.push(r.cleanText || r.rawText || "");
  }
  return { pageImages, perPage };
}

/** Join a 1-indexed inclusive page range of per-page OCR into one text block. */
function sliceOcr(perPage: string[], startPage: number, endPage: number): string {
  const seg = perPage.slice(startPage - 1, endPage);
  if (seg.length <= 1) return (seg[0] || "").trim();
  return seg.map((t, i) => `--- Page ${startPage + i} ---\n${t}\n`).join("\n").trim();
}

/**
 * Analyze an uploaded letter/PDF. Merges the files, OCRs each page, then uses AI
 * VISION to detect whether the PDF holds ONE complaint letter or SEVERAL. Each
 * detected complaint is extracted INDEPENDENTLY from its own page range. Creates
 * NO complaint — returns the detected complaints for the review screen. A single
 * complaint (or when AI is off) yields exactly one entry: today's behaviour.
 */
export async function analyzeComplaintIntakeAction(formData: FormData): Promise<IntakeAnalyzeResult> {
  try {
    await requireRole(COMPLAINT_WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const files = collectFiles(formData);
  if (files.length === 0) return { error: "No files provided." };

  const parts: { buffer: Buffer; mimeType: string }[] = [];
  for (const f of files) {
    const isImage = f.type.startsWith("image/");
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (!isImage && !isPdf) return { error: `Unsupported file "${f.name}". Use images or PDF.` };
    parts.push({ buffer: Buffer.from(await f.arrayBuffer()), mimeType: isPdf ? "application/pdf" : f.type });
  }
  const originalName = files.length === 1 ? files[0]!.name : `combined-upload-${files.length}-files.pdf`;

  try {
    const { pdf, pageCount } = await buildMergedPdf(parts);
    const storagePath = await uploadToR2({ key: `complaints/_intake/${randomUUID()}.pdf`, body: pdf, contentType: "application/pdf" });

    const { pageImages, perPage } = await renderAndOcr(pdf);
    const combined = perPage.map((t, i) => `--- Page ${i + 1} ---\n${t}`).join("\n\n");

    // AI boundary detection over the page images (falls back to one all-pages
    // letter when AI is unavailable — single-complaint behaviour preserved).
    const letters = await detectComplaintLetters({ pageImages, ocrText: combined, pageCount });

    const complaints: DetectedComplaint[] = [];
    for (const l of letters) {
      const ocrText = sliceOcr(perPage, l.startPage, l.endPage);
      // Extract each letter's fields from ITS OWN page images (vision) — reliable on
      // scans/Kannada where OCR text is too poor to fill fields. Falls back to OCR
      // text when AI is off.
      const letterImages = pageImages.slice(l.startPage - 1, l.endPage);
      const { extraction } = await analyzeComplaintIntakeFromImages({ pageImages: letterImages, ocrText });
      // Seed display fields from the detector when the per-section extractor left
      // them blank (e.g. very short OCR), so every card shows a subject/dept.
      if (!extraction.subject && l.subject) extraction.subject = l.subject;
      if (!extraction.department && l.department) extraction.department = l.department;
      if (!extraction.referenceNumber && l.referenceNumber) extraction.referenceNumber = l.referenceNumber;
      complaints.push({ pageStart: l.startPage, pageEnd: l.endPage, ocrText, extraction });
    }

    return { success: true, storagePath, originalName, pageCount, complaints };
  } catch (e) {
    console.error("[analyzeComplaintIntakeAction]", e);
    return { error: e instanceof Error ? e.message : "Analysis failed" };
  }
}

/** Insert one complaint from a reviewed extraction. Returns its id + case number. */
async function createOneComplaint(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  ex: ComplaintIntakeExtraction,
  caseNumberPrefix: string,
): Promise<{ complaintId: string; caseNumber: string } | { error: string }> {
  const year = new Date().getFullYear();
  const { data: rpc, error: rpcError } = await admin.rpc("next_complaint_case_number", {
    p_prefix: caseNumberPrefix || "DM-CMP",
    p_year: year,
  });
  if (rpcError || !rpc) return { error: `Could not generate a case number: ${rpcError?.message ?? "unknown"}` };
  const caseNumber = rpc as string;

  const type = COMPLAINT_TYPE_VALUES.includes(ex.complaintType as (typeof COMPLAINT_TYPE_VALUES)[number]) ? ex.complaintType : "Other";
  const status = SAFE_INTAKE_STATUS.has(ex.suggestedStatus) ? ex.suggestedStatus : "Draft";
  const jobNumber = /^\d{3}-\d{2}-\d{6}$/.test(ex.jobNumber || "") ? ex.jobNumber : null;
  const descParts = [
    ex.summary,
    ex.department ? `Department: ${ex.department}.` : "",
    ex.reporterName ? `Reporter: ${ex.reporterName}.` : "",
    ex.requestedAction ? `Requested action: ${ex.requestedAction}.` : "",
    "Created from an uploaded letter/PDF (AI-assisted intake — verify details).",
  ].filter(Boolean);

  const { data: comp, error } = await admin
    .from("complaints")
    .insert({
      title: ex.subject.slice(0, 300),
      type,
      status,
      priority: "Medium",
      job_number: jobNumber,
      internal_case_number: caseNumber,
      description: descParts.join(" "),
      location: ex.areaOrWard || null,
      reporter_name: ex.reporterName || null,
      requested_action: ex.requestedAction || null,
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  if (error || !comp) return { error: error?.message ?? "Could not create the complaint." };
  return { complaintId: comp.id as string, caseNumber };
}

/**
 * Commit: create one complaint per reviewed detected complaint. For a single
 * detected complaint the whole PDF is attached (unchanged behaviour); for several,
 * each complaint gets ITS pages carved into a sub-PDF, tagged with the page range
 * and a pointer to the preserved original, and its own AI summary is generated.
 */
export async function commitComplaintIntakeAction(input: {
  storagePath: string;
  originalName?: string;
  complaints: CommitComplaint[];
}): Promise<IntakeCommitResult> {
  let user;
  try {
    user = await requireRole(COMPLAINT_WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const admin = createAdminClient();
  const items = (input.complaints || []).filter((c) => c.extraction?.subject?.trim());
  if (items.length === 0) return { error: "A subject is required on at least one complaint to create it." };

  const settings = await getComplaintSettings();
  const original = await downloadFromR2(input.storagePath);
  const single = items.length === 1;
  const created: CreatedComplaintSummary[] = [];

  for (const item of items) {
    const ex = item.extraction;
    const res = await createOneComplaint(admin, user.id, ex, settings.caseNumberPrefix || "DM-CMP");
    if ("error" in res) {
      // Skip this one but keep going — a single failure shouldn't drop the batch.
      console.error("[commitComplaintIntakeAction] create failed", res.error);
      continue;
    }
    const { complaintId, caseNumber } = res;

    // Attach the letter. Single complaint → the whole original PDF (unchanged).
    // Multiple → this complaint's pages carved out, tagged with its page range.
    try {
      if (original) {
        let body = original;
        let pageStart: number | null = null;
        let pageEnd: number | null = null;
        if (!single) {
          const split = await extractPdfPages(original, item.pageStart, item.pageEnd);
          body = split.pdf;
          pageStart = item.pageStart;
          pageEnd = item.pageEnd;
        }
        const fileName = `${caseNumber}-letter.pdf`;
        const path = buildPath(complaintId, fileName, Date.now(), Math.random().toString(36).slice(2, 8));
        await uploadToR2({ key: path, body, contentType: "application/pdf" });
        const docType =
          ex.documentType === "acknowledgement"
            ? "Complaint acknowledgement"
            : ex.documentType === "reply"
              ? "Department reply"
              : "Complaint letter";
        const { data: docRow } = await admin
          .from("complaint_documents")
          .insert({
            complaint_id: complaintId,
            document_type: docType,
            title: fileName,
            original_file_name: fileName,
            storage_bucket: R2_STORAGE_SENTINEL,
            storage_path: path,
            mime_type: "application/pdf",
            file_size: body.byteLength,
            ocr_status: item.ocrText ? "Completed" : "Skipped",
            ocr_raw_text: item.ocrText ?? null,
            ocr_clean_text: item.ocrText ?? null,
            ocr_language: "eng+kan",
            ai_summary_status: isAiConfigured() && item.ocrText ? "generating" : "none",
            source_page_start: pageStart,
            source_page_end: pageEnd,
            source_original_path: single ? null : input.storagePath,
            source_original_name: single ? null : (input.originalName ?? null),
            uploaded_by: user.id,
          })
          .select("id")
          .single();

        // Independent per-complaint AI summary (background; OCR text already stored).
        if (docRow?.id && isAiConfigured() && item.ocrText) {
          void analyzeDocumentById(docRow.id as string, { force: true, ensureOcr: false }).catch((e) =>
            console.error("[intake] summary generation failed", e),
          );
        }
      }
    } catch (e) {
      console.warn("[commitComplaintIntakeAction] attach letter failed", e);
    }

    const nextActions = (ex.suggestedNextActions || []).slice(0, 6);
    await admin.from("complaint_timeline").insert({
      complaint_id: complaintId,
      event_type: "Created",
      title: "Complaint created from uploaded letter",
      summary:
        `${caseNumber} — ${ex.department || "department not recognised"}` +
        (single ? "" : ` (pages ${item.pageStart}–${item.pageEnd} of ${input.originalName ?? "the upload"})`) +
        "." +
        (nextActions.length ? ` Suggested next actions: ${nextActions.join("; ")}.` : ""),
      created_by: user.id,
    });

    created.push({ complaintId, caseNumber, subject: ex.subject.slice(0, 300), pageStart: item.pageStart, pageEnd: item.pageEnd });
  }

  if (created.length === 0) return { error: "No complaints could be created." };
  revalidatePath("/complaints");
  return { success: true, created };
}
