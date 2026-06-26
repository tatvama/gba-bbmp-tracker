import "server-only";

/**
 * Merge a mixed list of images and PDFs into a single PDF, preserving order.
 * Images (camera shots / scans) are normalised with sharp (auto-rotated,
 * size-capped, re-encoded as JPEG) then embedded one-per-page; PDF parts have
 * their pages copied in. Used by the RTI document-upload pipeline to turn a
 * multi-page capture or scanned PDF into one canonical, viewable document.
 */

import { PDFDocument } from "pdf-lib";

// Dynamically import sharp — native addon may be blocked during build/import on
// some environments (mirrors lib/ocr/image-preprocess.ts).
async function getSharp() {
  const s = await import("sharp");
  return s.default || s;
}

export interface MergePart {
  buffer: Buffer;
  mimeType: string;
}

export interface MergedPdf {
  pdf: Buffer;
  pageCount: number;
}

const MAX_IMAGE_DIMENSION = 2200; // cap longest pixel side before embedding
const MAX_PAGE_POINTS = 842; // longest PDF page side (≈ A4 long edge) in points

export function isPdfMime(mime: string | null | undefined): boolean {
  return mime === "application/pdf";
}

/** Normalise an image to a size-capped JPEG suitable for embedding. */
async function normalizeImage(input: Buffer): Promise<Buffer> {
  try {
    const sharp = await getSharp();
    return await sharp(input)
      .rotate() // auto-orient from EXIF
      .resize({
        width: MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch (e) {
    console.warn("[pdf-merge] image normalise failed; embedding original", e);
    return input;
  }
}

/**
 * Build one PDF from an ordered list of image and/or PDF parts.
 * Throws if no pages could be produced (so the caller can surface a clear error).
 */
export async function buildMergedPdf(parts: MergePart[]): Promise<MergedPdf> {
  const doc = await PDFDocument.create();

  for (const part of parts) {
    try {
      if (isPdfMime(part.mimeType)) {
        const src = await PDFDocument.load(part.buffer, { ignoreEncryption: true });
        const copied = await doc.copyPages(src, src.getPageIndices());
        copied.forEach((p) => doc.addPage(p));
        continue;
      }

      // Treat everything else as an image.
      const jpg = await normalizeImage(part.buffer);
      const embedded = await doc.embedJpg(jpg);
      const { width, height } = embedded;
      const scale = Math.min(1, MAX_PAGE_POINTS / Math.max(width, height));
      const pageW = width * scale;
      const pageH = height * scale;
      const page = doc.addPage([pageW, pageH]);
      page.drawImage(embedded, { x: 0, y: 0, width: pageW, height: pageH });
    } catch (e) {
      console.warn("[pdf-merge] skipping unreadable part", part.mimeType, e);
    }
  }

  const pageCount = doc.getPageCount();
  if (pageCount === 0) {
    throw new Error("Could not build a PDF from the uploaded files.");
  }

  const bytes = await doc.save();
  return { pdf: Buffer.from(bytes), pageCount };
}
