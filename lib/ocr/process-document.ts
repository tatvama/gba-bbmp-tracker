import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { downloadBuffer, uploadBuffer } from "@/lib/storage/supabase-upload";
import { runOcr } from "@/lib/ocr/ocr-service";
import { ocrAnyDocument } from "@/lib/ocr/process-job-document";
import { fingerprintImage } from "@/lib/ocr/image-fingerprint";
import { analyzeComplaintDocument } from "@/lib/ai/complaint-document-analyzer";
import { getComplaintSettings } from "@/lib/settings";
import { STORAGE_BUCKETS } from "@/lib/constants";
import type { ComplaintExtraction } from "@/lib/types";

/**
 * Orchestrates OCR for one complaint document: download (or reuse buffer) →
 * preprocess + OCR → upload processed image + thumbnail → persist results +
 * ocr_jobs status. Fully defensive: failures are recorded, never thrown.
 */
export async function processDocumentOcr(
  documentId: string,
  opts?: { buffer?: Buffer; analyze?: boolean },
): Promise<{ ok: boolean; status: string; error?: string }> {
  const admin = createAdminClient();
  const { data: doc } = await admin.from("complaint_documents").select("*").eq("id", documentId).single();
  if (!doc) return { ok: false, status: "Failed", error: "Document not found" };

  const nowIso = new Date().toISOString();
  await admin.from("complaint_documents").update({ ocr_status: "Processing" }).eq("id", documentId);
  const jobId = await startJob(admin, documentId, nowIso);

  const buffer = opts?.buffer ?? (await downloadBuffer(doc.storage_bucket, doc.storage_path));
  if (!buffer) {
    await admin.from("complaint_documents").update({ ocr_status: "Failed" }).eq("id", documentId);
    await finishJob(admin, jobId, "Failed", "Could not download original file");
    return { ok: false, status: "Failed", error: "Could not download original file" };
  }

  // Backfill image fingerprint if missing (best-effort).
  let fpUpdate: Record<string, unknown> = {};
  if (!doc.file_sha256) {
    try {
      const fp = await fingerprintImage(buffer, doc.mime_type ?? null);
      fpUpdate = {
        file_sha256: fp.sha256,
        phash: fp.phash,
        dhash: fp.dhash,
        exif_gps_lat: fp.gpsLat,
        exif_gps_lon: fp.gpsLon,
        exif_taken_at: fp.takenAt,
      };
    } catch (e) {
      console.warn("[ocr] fingerprint backfill failed", e);
    }
  }

  const settings = await getComplaintSettings();
  const mime = doc.mime_type ?? "application/octet-stream";
  const language = doc.ocr_language || settings.ocrLanguage;
  // PDFs (e.g. merged scans/acknowledgements) are rasterised page-by-page; runOcr
  // alone skips PDFs. Images keep the processed-image + thumbnail path.
  const res =
    mime === "application/pdf"
      ? { ...(await ocrAnyDocument(buffer, mime, language)), language, processedImage: undefined as Buffer | undefined, thumbnail: undefined as Buffer | undefined, error: undefined as string | undefined }
      : await runOcr({ buffer, mimeType: mime, language });

  // Upload processed image + thumbnail (best-effort).
  let processedPath: string | null = null;
  let thumbnailPath: string | null = null;
  try {
    if (res.processedImage) {
      processedPath = `${doc.complaint_id}/${documentId}-ocr.png`;
      await uploadBuffer({ bucket: STORAGE_BUCKETS.processed, path: processedPath, body: res.processedImage, contentType: "image/png", upsert: true });
    }
    if (res.thumbnail) {
      thumbnailPath = `${doc.complaint_id}/${documentId}-thumb.jpg`;
      await uploadBuffer({ bucket: STORAGE_BUCKETS.processed, path: thumbnailPath, body: res.thumbnail, contentType: "image/jpeg", upsert: true });
    }
  } catch (e) {
    console.warn("[ocr] processed image upload failed", e);
  }

  await admin.from("complaint_documents").update({
    ...fpUpdate,
    ocr_status: res.status,
    ocr_raw_text: res.rawText || null,
    ocr_clean_text: res.cleanText || null,
    ocr_confidence: res.confidence,
    ocr_language: res.language,
    processed_storage_path: processedPath,
    thumbnail_storage_path: thumbnailPath,
  }).eq("id", documentId);

  await finishJob(admin, jobId, res.status === "Failed" ? "Failed" : "Completed", res.error ?? null);

  if (opts?.analyze && res.cleanText && res.status !== "Failed") {
    await analyzeDocumentById(documentId).catch((e) => console.warn("[ai] analyze after ocr failed", e));
  }
  return { ok: res.status !== "Failed", status: res.status, error: res.error };
}

/** Re-run AI analysis on a document's stored OCR text. */
export async function analyzeDocumentById(
  documentId: string,
): Promise<{ ok: boolean; extraction?: ComplaintExtraction; error?: string }> {
  const admin = createAdminClient();
  const { data: doc } = await admin.from("complaint_documents").select("*").eq("id", documentId).single();
  if (!doc) return { ok: false, error: "Document not found" };

  const { data: c } = await admin
    .from("complaints")
    .select("internal_case_number,title,type,status,location,landmark,responsible_department,description")
    .eq("id", doc.complaint_id)
    .single();
  const context = c
    ? [
        `Case ${c.internal_case_number ?? "—"}: ${c.title}`,
        `Type ${c.type} | Status ${c.status}`,
        c.location ? `Location: ${c.location}${c.landmark ? `, ${c.landmark}` : ""}` : "",
        c.responsible_department ? `Department: ${c.responsible_department}` : "",
        c.description ? `Description: ${c.description}` : "",
      ].filter(Boolean).join("\n")
    : "";

  const result = await analyzeComplaintDocument({
    ocrText: doc.ocr_clean_text || doc.ocr_raw_text || "",
    documentType: doc.document_type,
    complaintContext: context,
    userNotes: doc.internal_notes ?? undefined,
  });

  const ex = result.extraction;
  await admin.from("complaint_documents").update({
    ai_summary: ex.summary || null,
    ai_extracted_json: ex,
    ai_suggested_status: ex.suggestedComplaintStatus || null,
    ai_suggested_next_action: ex.suggestedNextAction || null,
    ai_suggested_follow_up_date: isDate(ex.suggestedFollowUpDate) ? ex.suggestedFollowUpDate : null,
    ai_confidence: ex.confidence || null,
    verification_status: ex.needsManualReview ? "Low Confidence" : "Pending Review",
  }).eq("id", documentId);

  return { ok: result.ok, extraction: ex, error: result.error };
}

function isDate(v?: string): boolean {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

async function startJob(admin: ReturnType<typeof createAdminClient>, documentId: string, nowIso: string): Promise<string | null> {
  try {
    const { data: existing } = await admin.from("ocr_jobs").select("id,attempts").eq("document_id", documentId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existing?.id) {
      await admin.from("ocr_jobs").update({ status: "Processing", attempts: (existing.attempts ?? 0) + 1, started_at: nowIso, error_message: null }).eq("id", existing.id);
      return existing.id;
    }
    const { data } = await admin.from("ocr_jobs").insert({ document_id: documentId, status: "Processing", attempts: 1, started_at: nowIso }).select("id").single();
    return data?.id ?? null;
  } catch {
    return null;
  }
}

async function finishJob(admin: ReturnType<typeof createAdminClient>, jobId: string | null, status: string, error: string | null) {
  if (!jobId) return;
  try {
    await admin.from("ocr_jobs").update({ status, completed_at: new Date().toISOString(), error_message: error }).eq("id", jobId);
  } catch {
    /* ignore */
  }
}
