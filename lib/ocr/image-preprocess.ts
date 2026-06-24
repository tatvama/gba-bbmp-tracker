import "server-only";

/**
 * Server-side image preprocessing for OCR (sharp). Produces an OCR-friendly image
 * (auto-rotated, resized, grayscale, normalized, sharpened) and a small thumbnail.
 * All functions are defensive: on failure they return the original buffer so an
 * upload is never blocked by preprocessing.
 */

// Dynamically import sharp to avoid AppLocker failures on environments where native addons are blocked during build or imports
async function getSharp() {
  const s = await import("sharp");
  return s.default || s;
}

export interface PreprocessResult {
  ocrImage: Buffer; // grayscale, contrast-enhanced PNG for OCR
  thumbnail: Buffer; // small JPEG preview
  width?: number;
  height?: number;
}

const MAX_OCR_DIMENSION = 2200; // cap longest side for OCR speed/quality
const THUMB_DIMENSION = 480;

export function isImageMime(mime: string | null | undefined): boolean {
  return !!mime && ["image/jpeg", "image/png", "image/webp"].includes(mime);
}

export async function preprocessForOcr(input: Buffer): Promise<PreprocessResult> {
  try {
    const sharpInstance = await getSharp();
    const meta = await sharpInstance(input).metadata();
    const ocrImage = await sharpInstance(input)
      .rotate() // auto-orient from EXIF
      .resize({
        width: MAX_OCR_DIMENSION,
        height: MAX_OCR_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .grayscale()
      .normalize() // stretch contrast
      .sharpen()
      .png({ compressionLevel: 6 })
      .toBuffer();

    const thumbnail = await makeThumbnail(input);
    return { ocrImage, thumbnail, width: meta.width, height: meta.height };
  } catch (e) {
    console.warn("[ocr] preprocessForOcr failed; using original", e);
    const thumbnail = await makeThumbnail(input).catch(() => input);
    return { ocrImage: input, thumbnail };
  }
}

export async function makeThumbnail(input: Buffer): Promise<Buffer> {
  try {
    const sharpInstance = await getSharp();
    return await sharpInstance(input)
      .rotate()
      .resize({ width: THUMB_DIMENSION, height: THUMB_DIMENSION, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
  } catch {
    return input;
  }
}

