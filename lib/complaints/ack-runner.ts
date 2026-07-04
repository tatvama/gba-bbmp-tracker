import "server-only";

/**
 * Request-free background processor for a bulk acknowledgment batch. Kicked from
 * the ack-import Route Handler via `after()` (like processForensicBatch), so it
 * must NOT touch cookies/next-headers (no lib/settings, no requireRole).
 *
 * Pipeline, windowed so memory stays bounded on a 300+ page scan:
 *   for each window of pages → carve a sub-PDF → render → per page: thumbnail→R2,
 *   OCR → detect acknowledgment boundaries in the window → offset to global pages.
 * Then for each detected section: extract identifiers (analyzeComplaintIntake),
 * match against the complaint pool (scoreAckMatch), and persist an ack_import_items
 * row. Finally flip the batch to `review`.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { downloadFromR2, uploadToR2 } from "@/lib/storage/r2-upload";
import { extractPdfPages } from "@/lib/pdf/merge";
import { pdfRenderer } from "@/lib/pdf/pdf-renderer";
import { runOcr } from "@/lib/ocr/ocr-service";
import { detectAckSections, MAX_DETECT_PAGES } from "@/lib/ai/ack-section-detector";
import { analyzeComplaintIntake } from "@/lib/ai/complaint-intake-analyzer";
import { scoreAckMatch, loadComplaintPool, type PoolComplaint } from "@/lib/complaints/ack-matcher";
import { ackThumbKey } from "@/lib/complaints/ack-reconcile";
import { decodeQrFromImage } from "@/lib/pdf/qr-decode";
import { parseAckReference } from "@/lib/pdf/letter-reference";

/** Hard cap so a pathological upload can't run forever; the rest is reported. */
const MAX_PAGES = 600;

type Admin = ReturnType<typeof createAdminClient>;

async function setProgress(
  admin: Admin,
  batchId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await admin.from("ack_import_batches").update(patch).eq("id", batchId);
}

async function getSharp() {
  const s = await import("sharp");
  return s.default || s;
}

/** Small JPEG thumbnail for the review page-strip. */
async function thumbnail(buf: Buffer): Promise<Buffer> {
  try {
    const sharp = await getSharp();
    return await sharp(buf)
      .resize({ width: 520, height: 720, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 62 })
      .toBuffer();
  } catch {
    return buf;
  }
}

/** Join a 1-indexed inclusive range of per-page OCR into one block (sparse-safe). */
function sliceOcr(perPage: Record<number, string>, start: number, end: number): string {
  const parts: string[] = [];
  for (let p = start; p <= end; p++) {
    const t = (perPage[p] || "").trim();
    if (end > start) parts.push(`--- Page ${p} ---\n${t}\n`);
    else parts.push(t);
  }
  return parts.join("\n").trim();
}

export async function processAckBatch(batchId: string): Promise<void> {
  const admin = createAdminClient();
  try {
    const { data: batch } = await admin
      .from("ack_import_batches")
      .select("original_storage_path, page_count")
      .eq("id", batchId)
      .single();
    const originalUrl = (batch as { original_storage_path?: string } | null)?.original_storage_path;
    if (!originalUrl) throw new Error("Batch has no stored original PDF.");

    await setProgress(admin, batchId, { status: "processing", stage: "Downloading", message: "Fetching the uploaded PDF…" });
    const original = await downloadFromR2(originalUrl);
    if (!original) throw new Error("Could not download the uploaded PDF from storage.");

    // Total page count (prefer the value stored at upload; else re-derive cheaply).
    let total = Number((batch as { page_count?: number } | null)?.page_count || 0);
    if (!total) {
      const probe = await extractPdfPages(original, 1, 1_000_000);
      total = probe.pageCount;
    }
    const capped = Math.min(total, MAX_PAGES);
    await setProgress(admin, batchId, { page_count: total, stage: "Reading pages", message: `Rendering & OCR of ${capped} page(s)…` });

    const pool: PoolComplaint[] = await loadComplaintPool(admin);

    const perPageOcr: Record<number, string> = {};
    const thumbKeyByPage: Record<number, string> = {};
    // Reference decoded from a QR we stamped on the outgoing letter (Phase 2) — a
    // certain match when present.
    const qrRefByPage: Record<number, string> = {};
    const sections: { start: number; end: number; seedSubject: string | null; seedDept: string | null; seedRef: string | null; seedDate: string | null }[] = [];

    let processed = 0;
    for (let winStart = 1; winStart <= capped; winStart += MAX_DETECT_PAGES) {
      const winEnd = Math.min(winStart + MAX_DETECT_PAGES - 1, capped);
      const sub = await extractPdfPages(original, winStart, winEnd);
      const pages = await pdfRenderer.renderPages(sub.pdf);
      const visionImages: { buffer: Buffer; mimeType: string }[] = [];

      for (let j = 0; j < pages.length; j++) {
        const page = pages[j]!;
        const globalPage = winStart + j;
        // Thumbnail → R2 (best-effort; a missing thumb just shows a placeholder).
        try {
          const key = ackThumbKey(batchId, globalPage);
          await uploadToR2({ key, body: await thumbnail(page.buffer), contentType: "image/jpeg" });
          thumbKeyByPage[globalPage] = key;
        } catch (e) {
          console.warn("[ack-runner] thumbnail upload failed", globalPage, e);
        }
        // OCR full-res.
        try {
          const r = await runOcr({ buffer: page.buffer, mimeType: page.mimeType, language: "eng+kan" });
          perPageOcr[globalPage] = r.cleanText || r.rawText || "";
        } catch (e) {
          console.warn("[ack-runner] OCR failed", globalPage, e);
          perPageOcr[globalPage] = "";
        }
        // Reference QR (if this acknowledgment is a photocopy of a letter we stamped).
        try {
          const qr = await decodeQrFromImage(page.buffer);
          const ref = parseAckReference(qr);
          if (ref) qrRefByPage[globalPage] = ref;
        } catch { /* best-effort */ }
        visionImages.push({ buffer: page.buffer, mimeType: page.mimeType });
        processed++;
      }
      await setProgress(admin, batchId, { processed_pages: processed, message: `Read ${processed}/${capped} pages…` });

      // Detect acknowledgment boundaries within this window; offset to global pages.
      const winOcr = sliceOcr(perPageOcr, winStart, winEnd);
      const detected = await detectAckSections({ pageImages: visionImages, ocrText: winOcr, pageCount: winEnd - winStart + 1 });
      for (const d of detected) {
        sections.push({
          start: winStart + d.startPage - 1,
          end: winStart + d.endPage - 1,
          seedSubject: d.subject,
          seedDept: d.department,
          seedRef: d.referenceNumber,
          seedDate: d.documentDate,
        });
      }
    }

    // Extract + match + persist each detected section.
    await setProgress(admin, batchId, { stage: "Matching", message: `Matching ${sections.length} acknowledgment(s) to complaints…` });
    let order = 0;
    for (const s of sections) {
      const ocrText = sliceOcr(perPageOcr, s.start, s.end);
      const { extraction } = await analyzeComplaintIntake(ocrText);
      // Seed from the detector when the per-section extractor came up blank.
      if (!extraction.subject && s.seedSubject) extraction.subject = s.seedSubject;
      if (!extraction.department && s.seedDept) extraction.department = s.seedDept;
      if (!extraction.referenceNumber && s.seedRef) extraction.referenceNumber = s.seedRef;
      // A decoded reference QR beats everything — it names the complaint directly.
      let qrRef: string | null = null;
      for (let p = s.start; p <= s.end; p++) if (qrRefByPage[p]) { qrRef = qrRefByPage[p]!; break; }
      if (qrRef) extraction.referenceNumber = qrRef;

      const match = scoreAckMatch(extraction, pool);
      const thumbPaths: string[] = [];
      for (let p = s.start; p <= s.end; p++) if (thumbKeyByPage[p]) thumbPaths.push(thumbKeyByPage[p]!);

      await admin.from("ack_import_items").insert({
        batch_id: batchId,
        sort_order: order++,
        page_start: s.start,
        page_end: s.end,
        ocr_text: ocrText || null,
        extracted: extraction as unknown as Record<string, unknown>,
        thumb_paths: thumbPaths,
        proposed_complaint_id: match.proposedComplaintId,
        match_confidence: match.confidence,
        match_evidence: { candidates: match.candidates } as unknown as Record<string, unknown>,
        assigned_complaint_id: match.proposedComplaintId, // pre-fill; human confirms/overrides
        decision: "pending",
      });
    }

    const note = total > capped ? ` (first ${capped} of ${total} pages — split the file to process the rest)` : "";
    await setProgress(admin, batchId, {
      status: "review",
      stage: "Ready for review",
      message: `Detected ${sections.length} acknowledgment(s)${note}. Review and confirm the matches.`,
      processed_pages: capped,
      // Persist per-page OCR so boundary edits (merge/split) can re-slice without re-OCR.
      page_ocr: perPageOcr as unknown as Record<string, unknown>,
      finished_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[processAckBatch] failed", e);
    await setProgress(admin, batchId, {
      status: "failed",
      stage: "Failed",
      error: e instanceof Error ? e.message : "Processing failed",
      finished_at: new Date().toISOString(),
    });
  }
}
