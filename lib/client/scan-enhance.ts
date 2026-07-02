"use client";

/**
 * Client-side "scanned document" processing for live-camera captures:
 * grab the frame at the camera's FULL resolution (capped), auto-level the
 * exposure so paper reads white and ink reads black, add a touch of
 * mid-tone contrast, and encode a high-quality JPEG. One LUT pass over the
 * pixels — fast enough on a phone for a per-page capture. (The server's
 * sharp pipeline still normalises again when merging into the PDF.)
 */

/** Longest edge of the processed capture. ~5 MP keeps OCR sharp and phones fast. */
const MAX_EDGE = 2600;
const JPEG_QUALITY = 0.92;

/** Histogram percentile → linear stretch LUT with a mild S-curve. */
function buildLevelsLut(data: Uint8ClampedArray): Uint8Array {
  const hist = new Uint32Array(256);
  // Luminance histogram, sampled every 4th pixel for speed.
  for (let i = 0; i < data.length; i += 16) {
    const y = (data[i]! * 299 + data[i + 1]! * 587 + data[i + 2]! * 114) / 1000;
    const bin = Math.min(255, y | 0);
    hist[bin] = (hist[bin] ?? 0) + 1;
  }
  let total = 0;
  for (let i = 0; i < 256; i++) total += hist[i]!;
  const target = (p: number) => {
    const goal = total * p;
    let acc = 0;
    for (let i = 0; i < 256; i++) {
      acc += hist[i]!;
      if (acc >= goal) return i;
    }
    return 255;
  };
  // Clip 1% shadows / 2% highlights (paper should clip to white).
  const lo = target(0.01);
  const hi = Math.max(lo + 24, target(0.98));

  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let v = (i - lo) / (hi - lo);
    v = Math.min(1, Math.max(0, v));
    // Gentle S-curve for ink/paper separation without posterising photos.
    v = v + 0.14 * Math.sin(2 * Math.PI * (v - 0.5)) * (v * (1 - v) * 4);
    lut[i] = Math.round(Math.min(1, Math.max(0, v)) * 255);
  }
  return lut;
}

export interface CaptureOptions {
  /** Apply the document auto-levels (default true). False = plain photo. */
  enhance?: boolean;
}

/**
 * Capture the current video frame as a processed high-res JPEG File.
 * Returns null when the video has no frame yet.
 */
export async function captureScanFromVideo(
  video: HTMLVideoElement,
  fileName: string,
  opts: CaptureOptions = {},
): Promise<File | null> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  const scale = Math.min(1, MAX_EDGE / Math.max(vw, vh));
  const w = Math.round(vw * scale);
  const h = Math.round(vh * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(video, 0, 0, w, h);

  if (opts.enhance !== false) {
    try {
      const img = ctx.getImageData(0, 0, w, h);
      const lut = buildLevelsLut(img.data);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = lut[d[i]!]!;
        d[i + 1] = lut[d[i + 1]!]!;
        d[i + 2] = lut[d[i + 2]!]!;
      }
      ctx.putImageData(img, 0, 0);
    } catch {
      /* enhancement is best-effort — the raw frame still uploads */
    }
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) return null;
  return new File([blob], fileName, { type: "image/jpeg" });
}
