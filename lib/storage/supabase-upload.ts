import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALLOWED_UPLOAD_MIME, STORAGE_BUCKETS } from "@/lib/constants";

/**
 * Server-only Supabase Storage helpers. All access uses the service-role admin
 * client (never exposed to the browser). Buckets are PRIVATE; viewing is done via
 * short-lived signed URLs. Uploads flow through a server route/action.
 */

export const ALL_BUCKETS = Object.values(STORAGE_BUCKETS);

export interface UploadResult {
  bucket: string;
  path: string;
  size: number;
  contentType: string;
}

export function validateUpload(
  mimeType: string,
  size: number,
  maxBytes: number,
): { ok: boolean; error?: string } {
  if (!ALLOWED_UPLOAD_MIME.includes(mimeType as never)) {
    return { ok: false, error: `Unsupported file type: ${mimeType || "unknown"}. Allowed: JPEG, PNG, WebP, PDF.` };
  }
  if (size <= 0) return { ok: false, error: "Empty file." };
  if (size > maxBytes) {
    return { ok: false, error: `File too large (${(size / 1_048_576).toFixed(1)} MB). Max ${(maxBytes / 1_048_576).toFixed(0)} MB.` };
  }
  return { ok: true };
}

/** Slugify a filename for safe storage keys. */
export function safeName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^a-zA-Z0-9-_]+/g, "-").slice(0, 60) || "file";
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  return ext ? `${base}.${ext}` : base;
}

/** Build a deterministic-ish storage path: <complaintId>/<ts>-<rand>-<name>. */
export function buildPath(complaintId: string, fileName: string, ts: number, rand: string): string {
  return `${complaintId}/${ts}-${rand}-${safeName(fileName)}`;
}

/** Create the bucket if it does not exist (idempotent). Safe to call per upload. */
export async function ensureBucket(bucket: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.storage.createBucket(bucket, { public: false });
  // Ignore "already exists"; surface anything else.
  if (error && !/already exists/i.test(error.message)) {
    console.warn(`[storage] ensureBucket(${bucket})`, error.message);
  }
}

/** Upload a buffer to a private bucket. */
export async function uploadBuffer(params: {
  bucket: string;
  path: string;
  body: Buffer | Uint8Array;
  contentType: string;
  upsert?: boolean;
}): Promise<UploadResult> {
  const admin = createAdminClient();
  await ensureBucket(params.bucket);
  const { error } = await admin.storage
    .from(params.bucket)
    .upload(params.path, params.body, {
      contentType: params.contentType,
      upsert: params.upsert ?? false,
    });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return {
    bucket: params.bucket,
    path: params.path,
    size: params.body.byteLength,
    contentType: params.contentType,
  };
}

/** Create a signed URL for viewing a private object (default 1 hour). */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn = 3600,
): Promise<string | null> {
  if (!bucket || !path) return null;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (error) {
      console.warn(`[storage] getSignedUrl(${bucket}/${path})`, error.message);
      return null;
    }
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

/** Remove an object (best-effort). */
export async function removeObject(bucket: string, path: string): Promise<void> {
  if (!bucket || !path) return;
  try {
    const admin = createAdminClient();
    await admin.storage.from(bucket).remove([path]);
  } catch (e) {
    console.warn(`[storage] removeObject(${bucket}/${path})`, e);
  }
}

/** Download an object to a Buffer (server-side OCR re-runs). */
export async function downloadBuffer(bucket: string, path: string): Promise<Buffer | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage.from(bucket).download(path);
    if (error || !data) return null;
    const arrayBuf = await data.arrayBuffer();
    return Buffer.from(arrayBuf);
  } catch {
    return null;
  }
}
