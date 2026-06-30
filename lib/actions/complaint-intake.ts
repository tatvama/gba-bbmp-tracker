"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireRole, AuthorizationError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMPLAINT_WRITE_ROLES, STORAGE_BUCKETS } from "@/lib/constants";
import { buildMergedPdf } from "@/lib/pdf/merge";
import { pdfRenderer } from "@/lib/pdf/pdf-renderer";
import { runOcr } from "@/lib/ocr/ocr-service";
import { uploadToR2, downloadFromR2 } from "@/lib/storage/r2-upload";
import { uploadBuffer, buildPath } from "@/lib/storage/supabase-upload";
import { getComplaintSettings } from "@/lib/settings";
import {
  analyzeComplaintIntake,
  COMPLAINT_TYPE_VALUES,
  type ComplaintIntakeExtraction,
} from "@/lib/ai/complaint-intake-analyzer";

const SAFE_INTAKE_STATUS = new Set(["Draft", "Filed", "Acknowledged", "Reply Received"]);
const OCR_PAGE_CAP = 12;

export interface IntakeAnalyzeResult {
  success?: boolean;
  error?: string;
  storagePath?: string;
  ocrText?: string;
  pageCount?: number;
  extraction?: ComplaintIntakeExtraction;
}

export interface IntakeCommitResult {
  success?: boolean;
  error?: string;
  complaintId?: string;
  caseNumber?: string;
}

function collectFiles(formData: FormData): File[] {
  let raw = formData.getAll("files");
  if (raw.length === 0) raw = formData.getAll("file");
  return raw.filter(
    (x): x is File => typeof x === "object" && x !== null && typeof (x as { arrayBuffer?: unknown }).arrayBuffer === "function",
  );
}

async function ocrPdf(pdf: Buffer): Promise<string> {
  const pages = await pdfRenderer.renderPages(pdf);
  const parts: string[] = [];
  for (const p of pages.slice(0, OCR_PAGE_CAP)) {
    const r = await runOcr({ buffer: p.buffer, mimeType: p.mimeType, language: "eng+kan" });
    parts.push(r.cleanText || r.rawText || "");
  }
  return parts.join("\n").trim();
}

/** Analyze an uploaded letter/PDF: merge → OCR → AI-recognise department/subject/type. Creates NO case. */
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

  try {
    const { pdf, pageCount } = await buildMergedPdf(parts);
    const storagePath = await uploadToR2({ key: `complaints/_intake/${randomUUID()}.pdf`, body: pdf, contentType: "application/pdf" });
    const ocrText = await ocrPdf(pdf);
    const { extraction } = await analyzeComplaintIntake(ocrText);
    return { success: true, storagePath, ocrText, pageCount, extraction };
  } catch (e) {
    console.error("[analyzeComplaintIntakeAction]", e);
    return { error: e instanceof Error ? e.message : "Analysis failed" };
  }
}

/** Commit: create the complaint from the (reviewed) extraction + attach the letter. */
export async function commitComplaintIntakeAction(input: {
  storagePath: string;
  ocrText?: string;
  extraction: ComplaintIntakeExtraction;
}): Promise<IntakeCommitResult> {
  let user;
  try {
    user = await requireRole(COMPLAINT_WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const admin = createAdminClient();
  const ex = input.extraction;
  if (!ex?.subject?.trim()) return { error: "A subject is required to create the complaint." };

  const settings = await getComplaintSettings();
  const year = new Date().getFullYear();
  const { data: rpc, error: rpcError } = await admin.rpc("next_complaint_case_number", {
    p_prefix: settings.caseNumberPrefix || "DM-CMP",
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
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();
  if (error || !comp) return { error: error?.message ?? "Could not create the complaint." };
  const complaintId = comp.id as string;

  // Attach the uploaded letter as a complaint document (OCR already done).
  try {
    const pdf = await downloadFromR2(input.storagePath);
    if (pdf) {
      const fileName = `${caseNumber}-letter.pdf`;
      const path = buildPath(complaintId, fileName, Date.now(), Math.random().toString(36).slice(2, 8));
      await uploadBuffer({ bucket: STORAGE_BUCKETS.documents, path, body: pdf, contentType: "application/pdf" });
      const docType =
        ex.documentType === "acknowledgement"
          ? "Complaint acknowledgement"
          : ex.documentType === "reply"
            ? "Department reply"
            : "Complaint letter";
      await admin.from("complaint_documents").insert({
        complaint_id: complaintId,
        document_type: docType,
        title: fileName,
        original_file_name: fileName,
        storage_bucket: STORAGE_BUCKETS.documents,
        storage_path: path,
        mime_type: "application/pdf",
        file_size: pdf.byteLength,
        ocr_status: input.ocrText ? "Completed" : "Skipped",
        ocr_raw_text: input.ocrText ?? null,
        ocr_clean_text: input.ocrText ?? null,
        ocr_language: "eng+kan",
        uploaded_by: user.id,
      });
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
      `${caseNumber} — ${ex.department || "department not recognised"}.` +
      (nextActions.length ? ` Suggested next actions: ${nextActions.join("; ")}.` : ""),
    created_by: user.id,
  });

  revalidatePath("/complaints");
  return { success: true, complaintId, caseNumber };
}
