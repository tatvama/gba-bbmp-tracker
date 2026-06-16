import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { sha256, phash, dhash, hammingHex, fingerprintImage } from "../lib/ocr/image-fingerprint";

// Build a structured test image (gradient) from raw pixels, so pHash has signal.
async function gradient(horizontal: boolean, size = 64): Promise<Buffer> {
  const ch = 3;
  const buf = Buffer.alloc(size * size * ch);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = horizontal ? x / (size - 1) : y / (size - 1);
      const v = Math.round(t * 255);
      const i = (y * size + x) * ch;
      buf[i] = v;
      buf[i + 1] = v;
      buf[i + 2] = v;
    }
  }
  return sharp(buf, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
}

describe("hammingHex", () => {
  it("is 0 for identical hashes", () => {
    expect(hammingHex("0f0f0f0f0f0f0f0f", "0f0f0f0f0f0f0f0f")).toBe(0);
  });
  it("counts differing bits", () => {
    expect(hammingHex("0000000000000000", "0000000000000001")).toBe(1);
    expect(hammingHex("0000000000000000", "ffffffffffffffff")).toBe(64);
  });
  it("returns 64 when a hash is missing", () => {
    expect(hammingHex(null, "0000000000000000")).toBe(64);
    expect(hammingHex("0000000000000000", undefined)).toBe(64);
  });
});

describe("sha256", () => {
  it("is identical for identical bytes and differs otherwise", async () => {
    const a = await gradient(true);
    const b = Buffer.from(a);
    const c = await gradient(false);
    expect(sha256(a)).toBe(sha256(b));
    expect(sha256(a)).not.toBe(sha256(c));
    expect(sha256(a)).toHaveLength(64);
  });
});

describe("perceptual hashes", () => {
  it("same image → distance 0", async () => {
    const a = await gradient(true);
    expect(hammingHex(await phash(a), await phash(a))).toBe(0);
    expect(hammingHex(await dhash(a), await dhash(a))).toBe(0);
  });

  it("re-encoded + resized copy → small pHash distance, different SHA", async () => {
    const a = await gradient(true);
    const reencoded = await sharp(a).resize(60, 60).jpeg({ quality: 80 }).toBuffer();
    const dist = hammingHex(await phash(a), await phash(reencoded));
    expect(dist).toBeLessThanOrEqual(10);
    expect(sha256(a)).not.toBe(sha256(reencoded));
  });

  it("structurally different image → large pHash distance", async () => {
    const horiz = await gradient(true);
    const vert = await gradient(false);
    const dist = hammingHex(await phash(horiz), await phash(vert));
    expect(dist).toBeGreaterThan(10);
  });
});

describe("fingerprintImage", () => {
  it("returns sha always and perceptual hashes for images", async () => {
    const a = await gradient(true);
    const fp = await fingerprintImage(a, "image/png");
    expect(fp.sha256).toHaveLength(64);
    expect(fp.phash).toMatch(/^[0-9a-f]{16}$/);
    expect(fp.dhash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("skips perceptual hashing for non-images but still hashes bytes (e.g. PDF)", async () => {
    const fp = await fingerprintImage(Buffer.from("%PDF-1.4 fake"), "application/pdf");
    expect(fp.sha256).toHaveLength(64);
    expect(fp.phash).toBeNull();
    expect(fp.dhash).toBeNull();
  });
});
