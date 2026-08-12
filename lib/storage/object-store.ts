import "server-only";
import { ALLOWED_UPLOAD_MIME, STORAGE_BUCKETS, R2_STORAGE_SENTINEL } from "@/lib/constants";
import {
  uploadToR2,
  getR2SignedUrl,
  downloadFromR2ByKey,
  deleteFromR2,
  isR2Url,
} from "./r2-upload";

/**
 * Server-only object storage. Cloudflare R2 is the only backend; this replaces
 * the Supabase Storage adapter that used to sit alongside it.
 *
 * HOW THE OLD "BUCKETS" SURVIVE: Supabase had a bucket per document kind
 * (complaint-documents, rti-documents, ...) and the database stores that bucket
 * name next to each path. R2 has one bucket, so a Supabase bucket name becomes a
 * KEY PREFIX: bucket `B` + path `P` is the R2 key `B/P`. Every (bucket, path)
 * pair already in the database therefore keeps resolving with no data migration,
 * and callers keep passing the same two arguments they always did.
 *
 * Rows written by the forensic-ZIP importer instead carry the sentinel bucket
 * `r2` with a bare key (or full URL) in the path; those are passed straight
 * through, unprefixed, exactly as before.
 *
 * Objects are PRIVATE: reads go through short-lived presigned URLs, never the
 * public bucket URL.
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

/**
 * Maps a (bucket, path) pair to an R2 object key.
 *
 * A sentinel-bucket row already holds a key or a URL, so it is returned as-is;
 * anything else gets its logical bucket as a prefix.
 */
function toKey(bucket: string, path: string): string {
  if (bucket === R2_STORAGE_SENTINEL || isR2Url(path)) return path;
  return `${bucket}/${path}`;
}

/**
 * No-op, kept so the upload paths that called it need no edit. R2 uses a single
 * pre-existing bucket, and a key prefix needs no creation — unlike Supabase,
 * where each logical bucket was a real resource that had to exist first.
 */
export async function ensureBucket(_bucket: string): Promise<void> {
  // Intentionally empty.
}

/** Upload a buffer. */
export async function uploadBuffer(params: {
  bucket: string;
  path: string;
  body: Buffer | Uint8Array;
  contentType: string;
  upsert?: boolean;
}): Promise<UploadResult> {
  const body = Buffer.isBuffer(params.body) ? params.body : Buffer.from(params.body);
  // R2 PutObject overwrites by default, which is what upsert:true meant. There
  // is no cheap conditional-create equivalent, and every caller either writes a
  // freshly randomised path (buildPath) or intends replacement, so upsert:false
  // was never load-bearing.
  await uploadToR2({
    key: toKey(params.bucket, params.path),
    body,
    contentType: params.contentType,
    contentLength: body.byteLength,
  });
  return {
    bucket: params.bucket,
    path: params.path,
    size: body.byteLength,
    contentType: params.contentType,
  };
}

/** Short-lived presigned URL for viewing a private object (default 1 hour). */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn = 3600,
): Promise<string | null> {
  if (!bucket || !path) return null;
  try {
    return await getR2SignedUrl(toKey(bucket, path), expiresIn);
  } catch (e) {
    console.warn(`[storage] getSignedUrl(${bucket}/${path})`, e instanceof Error ? e.message : e);
    return null;
  }
}

/** Remove an object (best-effort). */
export async function removeObject(bucket: string, path: string): Promise<void> {
  if (!bucket || !path) return;
  try {
    await deleteFromR2(toKey(bucket, path));
  } catch (e) {
    console.warn(`[storage] removeObject(${bucket}/${path})`, e);
  }
}

/** Download an object to a Buffer (server-side OCR re-runs). */
export async function downloadBuffer(bucket: string, path: string): Promise<Buffer | null> {
  return downloadFromR2ByKey(toKey(bucket, path));
}
