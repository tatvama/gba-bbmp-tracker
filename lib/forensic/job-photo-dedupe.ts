import "server-only";
import { createAdminClient } from "@/lib/db";
import { downloadBuffer, getSignedUrl } from "@/lib/storage/object-store";
import { downloadFromR2ByKey, getR2SignedUrl } from "@/lib/storage/r2-upload";
import { hammingHex } from "@/lib/ocr/image-fingerprint";
import { DEFAULT_PHOTO_DEDUPE_RULES, R2_STORAGE_SENTINEL } from "@/lib/constants";
import { compareTwoPhotos } from "@/lib/ai/photo-vision";

/**
 * Cross-job-code duplicate-photo detection.
 *
 * SCOPE — a pair of photos is only compared when the two job codes are
 * plausibly contemporaneous: within ±6 months by EXIF capture date when both
 * photos carry one, otherwise the same or adjacent job-code year (the yy in
 * ddd-yy-nnnnnn; adjacent covers a window crossing year end). Fuzzy layers
 * additionally require the SAME division. Exact byte-copies (SHA) are always
 * flagged — a byte-identical file is unambiguous evidence wherever it appears.
 *
 * TWO layers:
 *  1. HASH (fast, free) — exact SHA + perceptual pHash/dHash. Catches a digital
 *     image reused verbatim across job codes. → runJobPhotoDuplicateAudit().
 *  2. VISUAL (vision AI) — the case the user cares about: a photo PRINTED on a
 *     document and scanned/re-photographed, where pixel hashes no longer match.
 *     Bounded pairwise compare within a division, cached. → scanDivisionVisualDuplicates().
 *
 * Photo universe: job_documents (forensic/portal imports) PLUS complaint_documents
 * images on complaints that are linked to a job case — so photos uploaded
 * directly to a complaint participate in the cross-job scan too.
 */

interface PhotoRow {
  documentId: string;
  source: "job" | "complaint";
  jobNumber: string;
  complaintId: string | null;
  division: string | null;
  fileName: string | null;
  bucket: string | null;
  path: string | null;
  sha256: string | null;
  phash: string | null;
  dhash: string | null;
  takenAt: string | null;
}

export interface DupPhoto {
  documentId: string;
  source: "job" | "complaint";
  jobNumber: string;
  complaintId: string | null;
  division: string | null;
  fileName: string | null;
  /** Short-lived signed view URL (thumbnail); null when not signed / unavailable. */
  url: string | null;
}

export interface JobPhotoDuplicateCluster {
  key: string;
  basis: "exact" | "perceptual" | "visual";
  severity: "High" | "Medium" | "Low";
  jobCodes: string[];
  divisions: string[];
  sameDivisionReuse: boolean;
  sharedDetails?: string;
  photos: DupPhoto[];
}

const FETCH_CAP = 4000;
const IN_CHUNK = 200; // db .in() batch size
const VISUAL_PAIR_BUDGET = 60; // max AI pairwise comparisons per division scan
const TIME_WINDOW_DAYS = 183; // ±6 months
const THUMBS_PER_CLUSTER = 8; // signed thumbnails per fingerprint cluster

/** Year encoded in a job code ddd-yy-nnnnnn → e.g. 2023; null if unparsable. */
function jobYear(jobNumber: string): number | null {
  const m = /^\d{3}-(\d{2})-/.exec(jobNumber);
  return m ? 2000 + Number(m[1]) : null;
}

/**
 * Are two photos close enough in time to be worth comparing? EXIF capture
 * dates (when both exist) decide precisely at ±6 months; otherwise fall back
 * to the job-code year — same year, or the adjacent year (a ±6-month window
 * crossing year end). Undatable pairs are allowed rather than silently dropped.
 */
function withinTimeWindow(a: PhotoRow, b: PhotoRow): boolean {
  const ta = a.takenAt ? Date.parse(a.takenAt) : NaN;
  const tb = b.takenAt ? Date.parse(b.takenAt) : NaN;
  if (Number.isFinite(ta) && Number.isFinite(tb)) {
    return Math.abs(ta - tb) <= TIME_WINDOW_DAYS * 86_400_000;
  }
  const ya = jobYear(a.jobNumber);
  const yb = jobYear(b.jobNumber);
  if (ya == null || yb == null) return true;
  return Math.abs(ya - yb) <= 1;
}

async function loadPhotoRows(division?: string): Promise<PhotoRow[]> {
  const admin = createAdminClient();
  // job_number → division; complaint_id → job_number (for complaint-uploaded photos)
  const { data: cases } = await admin.from("job_cases").select("job_number, division, complaint_id");
  const divByJob = new Map<string, string | null>();
  const jobByComplaint = new Map<string, string>();
  for (const c of cases ?? []) {
    divByJob.set(c.job_number as string, (c.division as string) ?? null);
    if (c.complaint_id) jobByComplaint.set(c.complaint_id as string, c.job_number as string);
  }

  const rows: PhotoRow[] = [];
  const pushRow = (d: Record<string, unknown>, source: "job" | "complaint", jobNumber: string, complaintId: string | null) => {
    const mime = (d.mime_type as string) ?? "";
    if (mime && !mime.startsWith("image/")) return; // photos only
    const div = divByJob.get(jobNumber) ?? null;
    if (division && div !== division) return;
    rows.push({
      documentId: d.id as string,
      source,
      jobNumber,
      complaintId,
      division: div,
      fileName: (d.original_file_name as string) ?? null,
      bucket: (d.storage_bucket as string) ?? null,
      path: (d.storage_path as string) ?? null,
      sha256: (d.file_sha256 as string) ?? null,
      phash: (d.phash as string) ?? null,
      dhash: (d.dhash as string) ?? null,
      takenAt: (d.exif_taken_at as string) ?? null,
    });
  };

  const { data: docs } = await admin
    .from("job_documents")
    .select("id, job_number, original_file_name, storage_bucket, storage_path, file_sha256, phash, dhash, mime_type, exif_taken_at")
    .or("phash.not.is.null,file_sha256.not.is.null")
    .limit(FETCH_CAP);
  for (const d of docs ?? []) pushRow(d, "job", d.job_number as string, null);

  // complaint_documents images on complaints linked to a job case
  const complaintIds = [...jobByComplaint.keys()];
  for (let i = 0; i < complaintIds.length; i += IN_CHUNK) {
    const chunk = complaintIds.slice(i, i + IN_CHUNK);
    const { data: cdocs } = await admin
      .from("complaint_documents")
      .select("id, complaint_id, original_file_name, storage_bucket, storage_path, file_sha256, phash, dhash, mime_type, exif_taken_at")
      .in("complaint_id", chunk)
      .or("phash.not.is.null,file_sha256.not.is.null")
      .limit(FETCH_CAP);
    for (const d of cdocs ?? []) {
      const cid = d.complaint_id as string;
      const jobNumber = jobByComplaint.get(cid);
      if (jobNumber) pushRow(d, "complaint", jobNumber, cid);
    }
  }
  return rows;
}

/**
 * Fingerprint match within scope. Exact SHA is allowed anywhere/anytime (a
 * byte-identical file needs no corroboration); perceptual requires the SAME
 * division AND the ±6-month / adjacent-year time window.
 */
function perceptualMatch(a: PhotoRow, b: PhotoRow): "exact" | "perceptual" | null {
  if (a.sha256 && b.sha256 && a.sha256 === b.sha256) return "exact";
  if (!a.division || a.division !== b.division) return null;
  if (!withinTimeWindow(a, b)) return null;
  const r = DEFAULT_PHOTO_DEDUPE_RULES;
  const pd = hammingHex(a.phash, b.phash);
  const dd = hammingHex(a.dhash, b.dhash);
  if (pd <= r.phashMax && dd <= r.dhashMax) return "perceptual";
  return null;
}

/** Short-lived signed view URL for a photo row. Never throws. */
async function signPhotoUrl(bucket: string | null, path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    if (bucket === R2_STORAGE_SENTINEL) return await getR2SignedUrl(path, 3600);
    if (!bucket) return null;
    return await getSignedUrl(bucket, path, 3600);
  } catch {
    return null;
  }
}

function toDupPhoto(row: PhotoRow, url: string | null = null): DupPhoto {
  return {
    documentId: row.documentId,
    source: row.source,
    jobNumber: row.jobNumber,
    complaintId: row.complaintId,
    division: row.division,
    fileName: row.fileName,
    url,
  };
}

/** Build clusters via Union-Find; keep only clusters spanning ≥2 distinct job codes. */
function buildClusters(
  rows: PhotoRow[],
  matcher: (a: PhotoRow, b: PhotoRow) => "exact" | "perceptual" | null,
): { cluster: JobPhotoDuplicateCluster; rowIdxs: number[] }[] {
  const parent = rows.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const union = (i: number, j: number) => {
    parent[find(i)] = find(j);
  };
  const basisOf = new Map<string, "exact" | "perceptual">();
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const m = matcher(rows[i]!, rows[j]!);
      if (m) {
        union(i, j);
        const root = String(find(i));
        if (m === "exact" || !basisOf.has(root)) basisOf.set(root, m);
      }
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < rows.length; i++) {
    const root = find(i);
    (groups.get(root) ?? groups.set(root, []).get(root)!).push(i);
  }

  const clusters: { cluster: JobPhotoDuplicateCluster; rowIdxs: number[] }[] = [];
  for (const [root, idxs] of groups) {
    if (idxs.length < 2) continue;
    const jobCodes = [...new Set(idxs.map((i) => rows[i]!.jobNumber))];
    if (jobCodes.length < 2) continue; // must span ≥2 job codes
    const divisions = [...new Set(idxs.map((i) => rows[i]!.division).filter(Boolean) as string[])];
    // same-division reuse: some division holds ≥2 distinct job codes
    const byDiv = new Map<string, Set<string>>();
    for (const i of idxs) {
      const d = rows[i]!.division ?? "(unknown)";
      (byDiv.get(d) ?? byDiv.set(d, new Set()).get(d)!).add(rows[i]!.jobNumber);
    }
    const sameDivisionReuse = [...byDiv.values()].some((s) => s.size >= 2);
    const basis = basisOf.get(String(root)) ?? "perceptual";
    clusters.push({
      cluster: {
        key: `hash-${root}`,
        basis,
        severity: basis === "exact" ? "High" : "Medium",
        jobCodes,
        divisions,
        sameDivisionReuse,
        photos: idxs.map((i) => toDupPhoto(rows[i]!)),
      },
      rowIdxs: idxs,
    });
  }
  // same-division reuse first, then larger clusters
  clusters.sort(
    (a, b) =>
      Number(b.cluster.sameDivisionReuse) - Number(a.cluster.sameDivisionReuse) ||
      b.cluster.photos.length - a.cluster.photos.length,
  );
  return clusters;
}

/**
 * HASH-based cross-job duplicate clusters (digital reuse). Pass sign:true to
 * fill short-lived thumbnail URLs (only for pages that render the photos —
 * Supabase signing is a network call per photo).
 */
export async function runJobPhotoDuplicateAudit(opts?: { division?: string; sign?: boolean }): Promise<JobPhotoDuplicateCluster[]> {
  const rows = await loadPhotoRows(opts?.division);
  const built = buildClusters(rows, perceptualMatch);
  if (opts?.sign) {
    await Promise.all(
      built.flatMap(({ cluster, rowIdxs }) =>
        rowIdxs.slice(0, THUMBS_PER_CLUSTER).map(async (rowIdx, i) => {
          const row = rows[rowIdx]!;
          cluster.photos[i]!.url = await signPhotoUrl(row.bucket, row.path);
        }),
      ),
    );
  }
  return built.map((b) => b.cluster);
}

export interface VisualDuplicateMatch {
  a: DupPhoto;
  b: DupPhoto;
  confidence: string;
  sharedDetails: string;
  sameDivision: boolean;
}

export interface VisualScanResult {
  ok: boolean;
  comparisons: number;
  cached: number;
  matches: VisualDuplicateMatch[];
  capped: boolean;
  error?: string;
}

/** Download a photo bytes — by bare key (forensic imports) or by bucket+path. */
async function downloadPhoto(row: PhotoRow): Promise<Buffer | null> {
  if (!row.path) return null;
  if (row.bucket === R2_STORAGE_SENTINEL) return downloadFromR2ByKey(row.path);
  if (!row.bucket) return null;
  return downloadBuffer(row.bucket, row.path);
}

function mimeFromName(name: string | null): string {
  const ext = (name?.split(".").pop() || "").toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

export interface VisualScanHooks {
  /** Called before each pair is judged — (pairsDone, pairsTotal). Optional;
   *  lets a caller (e.g. the "vision_scan" background job) report progress. */
  onProgress?: (done: number, total: number) => void | Promise<void>;
  /** Checked between pairs; returning true stops the scan early with whatever
   *  matches were already found (a real, honored mid-scan cancellation point —
   *  unlike a single AI call, this loop has many natural stopping points). */
  isCancelled?: () => boolean | Promise<boolean>;
}

/**
 * VISUAL scan within a division: pairwise vision compare of photos from DIFFERENT
 * job codes inside the ±6-month / adjacent-year window that hashes did NOT already
 * match (the print→scan case). Bounded by a pair budget; verdicts cached in
 * photo_match_verdicts so each pair is judged once.
 */
export async function scanDivisionVisualDuplicates(division: string, hooks?: VisualScanHooks): Promise<VisualScanResult> {
  const admin = createAdminClient();
  const rows = (await loadPhotoRows(division)).filter((r) => r.path && r.bucket);
  if (rows.length < 2) return { ok: true, comparisons: 0, cached: 0, matches: [], capped: false };

  // Candidate pairs: different job codes, contemporaneous, not already hash-identical.
  const pairs: [PhotoRow, PhotoRow][] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]!;
      const b = rows[j]!;
      if (a.jobNumber === b.jobNumber) continue;
      if (!withinTimeWindow(a, b)) continue;
      if (perceptualMatch(a, b)) continue; // hash already catches these
      pairs.push([a, b]);
    }
  }
  const capped = pairs.length > VISUAL_PAIR_BUDGET;
  const budgeted = pairs.slice(0, VISUAL_PAIR_BUDGET);

  const matches: VisualDuplicateMatch[] = [];
  let comparisons = 0;
  let cached = 0;
  let pairIndex = 0;
  for (const [a, b] of budgeted) {
    if (hooks?.isCancelled && (await hooks.isCancelled())) break;
    await hooks?.onProgress?.(pairIndex, budgeted.length);
    pairIndex++;
    const [docA, docB] = a.documentId < b.documentId ? [a, b] : [b, a];
    // cache lookup
    const { data: existing } = await admin
      .from("photo_match_verdicts")
      .select("verdict, confidence, shared_details")
      .eq("doc_a", docA.documentId)
      .eq("doc_b", docB.documentId)
      .maybeSingle();

    let verdict = existing?.verdict as string | undefined;
    let confidence = (existing?.confidence as string) ?? "Medium";
    let sharedDetails = (existing?.shared_details as string) ?? "";

    if (!verdict) {
      if (!docA.path || !docB.path) continue;
      const [ba, bb] = await Promise.all([downloadPhoto(docA), downloadPhoto(docB)]);
      if (!ba || !bb) continue;
      const cmp = await compareTwoPhotos(
        { buffer: ba, mime: mimeFromName(docA.fileName) },
        { buffer: bb, mime: mimeFromName(docB.fileName) },
        true,
      );
      comparisons += 1;
      if (!cmp) continue;
      verdict = cmp.verdict;
      confidence = cmp.confidence;
      sharedDetails = cmp.sharedDetails;
      await admin.from("photo_match_verdicts").insert({
        doc_a: docA.documentId,
        doc_b: docB.documentId,
        basis: "visual",
        verdict,
        confidence,
        shared_details: sharedDetails,
        model: "vision",
      });
    } else {
      cached += 1;
    }

    if (verdict === "same") {
      const [urlA, urlB] = await Promise.all([
        signPhotoUrl(docA.bucket, docA.path),
        signPhotoUrl(docB.bucket, docB.path),
      ]);
      matches.push({
        a: toDupPhoto(docA, urlA),
        b: toDupPhoto(docB, urlB),
        confidence,
        sharedDetails,
        sameDivision: docA.division != null && docA.division === docB.division,
      });
    }
  }
  return { ok: true, comparisons, cached, matches, capped };
}
