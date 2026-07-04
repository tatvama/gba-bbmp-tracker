import "server-only";

/**
 * Decode a QR code from a page image (best-effort). Used by the acknowledgment
 * pipeline: if a scanned acknowledgment carries the reference QR we stamped on the
 * outgoing letter, we read it straight off the page and match with certainty —
 * no reliance on OCR of the printed reference text.
 */
export async function decodeQrFromImage(buffer: Buffer): Promise<string | null> {
  try {
    const sharp = (await import("sharp")).default;
    const jsQR = (await import("jsqr")).default;
    const { data, info } = await sharp(buffer)
      .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
    const result = jsQR(pixels, info.width, info.height);
    return result?.data ?? null;
  } catch (e) {
    console.warn("[qr-decode] failed", e);
    return null;
  }
}
