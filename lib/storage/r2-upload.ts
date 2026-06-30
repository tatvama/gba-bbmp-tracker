import "server-only";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

/**
 * Cloudflare R2 storage helpers (S3-compatible).
 * Requires env vars:
 *   R2_ACCOUNT_ID          — Cloudflare account ID
 *   R2_ACCESS_KEY_ID       — R2 API token access key
 *   R2_SECRET_ACCESS_KEY   — R2 API token secret
 *   R2_BUCKET_NAME         — bucket name (e.g. "gba-bbmp-tracker")
 *   R2_PUBLIC_URL          — public base URL (e.g. "https://pub-xxx.r2.dev")
 */

function getClient(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 credentials not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function publicUrl(key: string): string {
  const base = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("R2_PUBLIC_URL is not configured");
  return `${base}/${key}`;
}

/** Extract the R2 object key from a public URL. */
function keyFromUrl(url: string): string {
  const base = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
  return base ? url.replace(`${base}/`, "") : url;
}

/** True if a stored path is already a full public URL (R2 or otherwise). */
export function isR2Url(path: string): boolean {
  return path.startsWith("https://") || path.startsWith("http://");
}

/**
 * Upload a buffer to R2 and return the public URL.
 * The bucket must have public access enabled (or a custom domain attached).
 */
export async function uploadToR2(params: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<string> {
  const client = getClient();
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("R2_BUCKET_NAME is not configured");

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    }),
  );

  return publicUrl(params.key);
}

/**
 * Download a public R2 file by URL and return it as a Buffer.
 * Uses plain fetch — no credentials needed for public buckets.
 */
export async function downloadFromR2(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[r2] downloadFromR2 ${res.status} for ${url}`);
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    console.warn("[r2] downloadFromR2 failed", e);
    return null;
  }
}

/**
 * Delete an R2 object. Accepts either a full public URL or a raw key.
 * Best-effort — logs on failure but does not throw.
 */
export async function deleteFromR2(urlOrKey: string): Promise<void> {
  try {
    const client = getClient();
    const bucket = process.env.R2_BUCKET_NAME;
    if (!bucket) return;
    const key = isR2Url(urlOrKey) ? keyFromUrl(urlOrKey) : urlOrKey;
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (e) {
    console.warn("[r2] deleteFromR2 failed", e);
  }
}
