import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { downloadBuffer } from "@/lib/storage/supabase-upload";
import { downloadFromR2ByKey } from "@/lib/storage/r2-upload";
import { R2_STORAGE_SENTINEL } from "@/lib/constants";
import { runOcr } from "@/lib/ocr/ocr-service";
import { pdfRenderer } from "@/lib/pdf/pdf-renderer";
import { analyzeComplaintDocument } from "@/lib/ai/complaint-document-analyzer";

/**
 * OCR for portal-imported job documents (job_documents table).
 *
 * Reuses the same primitives as the complaint pipeline (runOcr, pdfRenderer,
 * analyzeComplaintDocument). The key difference: most portal files are PDFs, and
 * runOcr() skips PDFs — so, exactly like the RTI document flow, we rasterise each
 * PDF page via pdfRenderer and OCR the page images (eng+kan). Fully defensive:
 * failures are recorded on the row, never thrown.
 */

export interface OcrAnyResult {
  status: "Completed" | "Failed" | "Skipped" | "Needs Manual Review";
  rawText: string;
  cleanText: string;
  confidence: number | null;
}

/** OCR a buffer that may be a PDF (rasterise pages) or an image (direct). */
export async function ocrAnyDocument(buffer: Buffer, mime: string, language = "eng+kan"): Promise<OcrAnyResult> {
  if (mime === "application/pdf") {
    let pages;
    try {
      pages = await pdfRenderer.renderPages(buffer);
    } catch (e) {
      return { status: "Failed", rawText: "", cleanText: "", confidence: null };
    }
    if (!pages.length) return { status: "Skipped", rawText: "", cleanText: "", confidence: null };

    let combined = "";
    let totalConf = 0;
    let confCount = 0;
    for (let i = 0; i < pages.length; i++) {
      const pg = pages[i];
      if (!pg) continue;
      const r = await runOcr({ buffer: pg.buffer, mimeType: pg.mimeType, language });
      if (pages.length > 1) combined += `--- Page ${i + 1} ---\n${r.cleanText}\n\n`;
      else combined = r.cleanText;
      if (r.confidence !== null) {
        totalConf += r.confidence;
        confCount++;
      }
    }
    const cleanText = combined.trim();
    return {
      status: cleanText.length >= 12 ? "Completed" : "Needs Manual Review",
      rawText: combined,
      cleanText,
      confidence: confCount > 0 ? Math.round(totalConf / confCount) : null,
    };
  }

  const r = await runOcr({ buffer, mimeType: mime, language });
  return { status: r.status, rawText: r.rawText, cleanText: r.cleanText, confidence: r.confidence };
}

/** OCR (and optionally AI-summarise) one job document, persisting results. */
export async function processJobDocumentOcr(
  jobDocId: string,
  opts?: { buffer?: Buffer; analyze?: boolean },
): Promise<{ ok: boolean; status: string; error?: string }> {
  const admin = createAdminClient();
  const { data: doc } = await admin.from("job_documents").select("*").eq("id", jobDocId).single();
  if (!doc) return { ok: false, status: "Failed", error: "Document not found" };

  await admin.from("job_documents").update({ ocr_status: "Processing" }).eq("id", jobDocId);

  const buffer =
    opts?.buffer ??
    (doc.storage_bucket === R2_STORAGE_SENTINEL
      ? await downloadFromR2ByKey(doc.storage_path)
      : await downloadBuffer(doc.storage_bucket, doc.storage_path));
  if (!buffer) {
    await admin.from("job_documents").update({ ocr_status: "Failed" }).eq("id", jobDocId);
    return { ok: false, status: "Failed", error: "Could not download original file" };
  }

  let res: OcrAnyResult;
  try {
    res = await ocrAnyDocument(buffer, doc.mime_type ?? "application/octet-stream", doc.ocr_language || "eng+kan");
  } catch (e) {
    await admin.from("job_documents").update({ ocr_status: "Failed" }).eq("id", jobDocId);
    return { ok: false, status: "Failed", error: e instanceof Error ? e.message : "OCR failed" };
  }

  await admin
    .from("job_documents")
    .update({
      ocr_status: res.status,
      ocr_raw_text: res.rawText || null,
      ocr_clean_text: res.cleanText || null,
      ocr_confidence: res.confidence,
    })
    .eq("id", jobDocId);

  if (opts?.analyze && res.cleanText && res.status !== "Failed") {
    try {
      const result = await analyzeComplaintDocument({
        ocrText: res.cleanText,
        documentType: doc.document_type,
        complaintContext: `Portal job ${doc.job_number}`,
      });
      const ex = result.extraction;
      await admin
        .from("job_documents")
        .update({ ai_summary: ex.summary || null, ai_extracted_json: ex })
        .eq("id", jobDocId);
    } catch (e) {
      console.warn("[job-ocr] analyze failed (ocr preserved)", e);
    }
  }

  return { ok: res.status !== "Failed", status: res.status, error: undefined };
}

/**
 * Process up to `max` queued documents for a job case (UI calls this in a loop for
 * a progress bar). Returns how many remain queued so the caller knows when to stop.
 */
export async function processQueuedJobDocs(
  jobCaseId: string,
  opts?: { max?: number; analyze?: boolean },
): Promise<{ processed: number; remaining: number; errors: number }> {
  const admin = createAdminClient();
  const max = opts?.max ?? 3;
  const { data: queued } = await admin
    .from("job_documents")
    .select("id")
    .eq("job_case_id", jobCaseId)
    .in("ocr_status", ["Queued", "Processing"])
    .limit(max);

  let processed = 0;
  let errors = 0;
  for (const d of queued ?? []) {
    const r = await processJobDocumentOcr(d.id as string, { analyze: opts?.analyze });
    processed++;
    if (!r.ok) errors++;
  }

  const { count } = await admin
    .from("job_documents")
    .select("id", { count: "exact", head: true })
    .eq("job_case_id", jobCaseId)
    .in("ocr_status", ["Queued", "Processing"]);

  return { processed, remaining: count ?? 0, errors };
}
