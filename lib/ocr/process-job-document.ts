import "server-only";
import { runOcr } from "@/lib/ocr/ocr-service";
import { pdfRenderer } from "@/lib/pdf/pdf-renderer";

/**
 * Shared PDF-aware OCR primitive, used by the complaint document pipeline
 * (lib/ocr/process-document.ts). Most PDFs aren't handled by runOcr() itself
 * — so, exactly like the RTI document flow, we rasterise each PDF page via
 * pdfRenderer and OCR the page images (eng+kan).
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
