import crypto from "node:crypto";
import sharp from "sharp";
import exifr from "exifr";

// No "server-only" guard: this is a pure Node utility (crypto/sharp/exifr) shared
// by the server upload route/OCR pipeline AND the tsx backfill script, so the
// fingerprint algorithm is identical everywhere. sharp/exifr keep it server-side
// in practice (they can't bundle into a client component).

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"];
function isImageMime(mime: string | null | undefined): boolean {
  return !!mime && IMAGE_MIMES.includes(mime);
}

/**
 * Image fingerprinting for duplicate-photo detection. Computes:
 *   - SHA-256 of the raw bytes (byte-identical reuse; also works for PDFs)
 *   - dHash + pHash (64-bit, hex) for perceptual near-duplicate detection
 *   - EXIF GPS + capture timestamp (corroborating signal)
 * All defensive: any failure yields nulls, never throws — fingerprinting must
 * never break an upload.
 */

export interface PhotoFingerprint {
  sha256: string;
  phash: string | null;
  dhash: string | null;
  gpsLat: number | null;
  gpsLon: number | null;
  takenAt: string | null;
}

export function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** Difference hash: 9×8 grayscale, compare horizontally adjacent pixels → 64 bits. */
export async function dhash(input: Buffer): Promise<string | null> {
  try {
    const W = 9, H = 8;
    const px = await sharp(input).rotate().grayscale().resize(W, H, { fit: "fill" }).raw().toBuffer();
    let bits = 0n;
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W - 1; c++) {
        const left = px[r * W + c] ?? 0;
        const right = px[r * W + c + 1] ?? 0;
        bits = (bits << 1n) | (left > right ? 1n : 0n);
      }
    }
    return bits.toString(16).padStart(16, "0");
  } catch {
    return null;
  }
}

function dct1d(vec: number[]): number[] {
  const N = vec.length;
  const out = new Array<number>(N).fill(0);
  for (let k = 0; k < N; k++) {
    let s = 0;
    for (let n = 0; n < N; n++) s += (vec[n] ?? 0) * Math.cos((Math.PI * (2 * n + 1) * k) / (2 * N));
    out[k] = s;
  }
  return out;
}

/** Perceptual hash: 32×32 grayscale → 2D DCT → top-left 8×8 (drop DC) vs median → 64 bits. */
export async function phash(input: Buffer): Promise<string | null> {
  try {
    const N = 32;
    const px = await sharp(input).rotate().grayscale().resize(N, N, { fit: "fill" }).raw().toBuffer();
    const rows: number[][] = [];
    for (let y = 0; y < N; y++) {
      const row = new Array<number>(N);
      for (let x = 0; x < N; x++) row[x] = px[y * N + x] ?? 0;
      rows.push(dct1d(row));
    }
    // DCT down the columns; we only need the top-left 8×8 block.
    const block: number[] = [];
    for (let x = 0; x < 8; x++) {
      const col = new Array<number>(N);
      for (let y = 0; y < N; y++) col[y] = rows[y]?.[x] ?? 0;
      const c = dct1d(col);
      for (let y = 0; y < 8; y++) block[y * 8 + x] = c[y] ?? 0;
    }
    // Median of the 64 coefficients excluding the DC term (index 0).
    const sorted = block.slice(1).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    let bits = 0n;
    for (let i = 0; i < 64; i++) bits = (bits << 1n) | ((block[i] ?? 0) > median ? 1n : 0n);
    return bits.toString(16).padStart(16, "0");
  } catch {
    return null;
  }
}

async function extractExif(buffer: Buffer): Promise<{ lat: number | null; lon: number | null; takenAt: string | null }> {
  try {
    const gps = await exifr.gps(buffer).catch(() => null);
    const data = await exifr
      .parse(buffer, ["DateTimeOriginal", "CreateDate", "ModifyDate"])
      .catch(() => null);
    const raw = data?.DateTimeOriginal ?? data?.CreateDate ?? data?.ModifyDate ?? null;
    let takenAt: string | null = null;
    if (raw) {
      const d = raw instanceof Date ? raw : new Date(raw);
      if (!Number.isNaN(d.getTime())) takenAt = d.toISOString();
    }
    return { lat: gps?.latitude ?? null, lon: gps?.longitude ?? null, takenAt };
  } catch {
    return { lat: null, lon: null, takenAt: null };
  }
}

/** Full fingerprint. SHA always; perceptual + EXIF only for raster images. */
export async function fingerprintImage(buffer: Buffer, mime: string | null): Promise<PhotoFingerprint> {
  const sha = sha256(buffer);
  if (!isImageMime(mime)) {
    return { sha256: sha, phash: null, dhash: null, gpsLat: null, gpsLon: null, takenAt: null };
  }
  const [ph, dh, exif] = await Promise.all([phash(buffer), dhash(buffer), extractExif(buffer)]);
  return { sha256: sha, phash: ph, dhash: dh, gpsLat: exif.lat, gpsLon: exif.lon, takenAt: exif.takenAt };
}

/** Hamming distance between two 16-hex (64-bit) hashes. Returns 64 if either is null. */
export function hammingHex(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 64;
  let x: bigint;
  try {
    x = BigInt("0x" + a) ^ BigInt("0x" + b);
  } catch {
    return 64;
  }
  let count = 0;
  while (x > 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}
