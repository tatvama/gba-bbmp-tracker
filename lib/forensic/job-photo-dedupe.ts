import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { downloadBuffer } from "@/lib/storage/supabase-upload";
import { downloadFromR2ByKey } from "@/lib/storage/r2-upload";
import { hammingHex } from "@/lib/ocr/image-fingerprint";
import { DEFAULT_PHOTO_DEDUPE_RULES, R2_STORAGE_SENTINEL } from "@/lib/constants";
import { compareTwoPhotos } from "@/lib/ai/photo-vision";

/**
 * Cross-job-code duplicate-photo detection.
 *
 * TWO layers:
 *  1. HASH (fast, free) — exact SHA + perceptual pHash/dHash. Catches a digital
 *     image reused verbatim across job codes. → runJobPhotoDuplicateAudit().
 *  2. VISUAL (vision AI) — the case the user cares about: a photo PRINTED on a
 *     document and scanned/re-photographed, where pixel hashes no longer match.
 *     Bounded pairwise compare within a division, cached. → scanDivisionVisualDuplicates().
 *
 * Photos belong to job_documents (forensic/portal); division comes from job_cases.
 */

interface PhotoRow {
  documentId: string;
  jobNumber: string;
  division: string | null;
  fileName: string | null;
  bucket: string | null;
  path: string | null;
  sha256: string | null;
  phash: string | null;
  dhash: string | null;
}

export interface DupPhoto {
  documentId: string;
  jobNumber: string;
  division: string | null;
  fileName: string | null;
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
const VISUAL_PAIR_BUDGET = 60; // max AI pairwise comparisons per division scan

async function loadPhotoRows(division?: string): Promise<PhotoRow[]> {
  const admin = createAdminClient();
  // job_number → division (+ optional filter)
  const { data: cases } = await admin.from("job_cases").select("job_number, division");
  const divByJob = new Map<string, string | null>();
  for (const c of cases ?? []) divByJob.set(c.job_number as string, (c.division as string) ?? null);

  const { data: docs } = await admin
    .from("job_documents")
    .select("id, job_number, original_file_name, storage_bucket, storage_path, file_sha256, phash, dhash, mime_type")
    .or("phash.not.is.null,file_sha256.not.is.null")
    .limit(FETCH_CAP);

  const rows: PhotoRow[] = [];
  for (const d of docs ?? []) {
    const mime = (d.mime_type as string) ?? "";
    if (mime && !mime.startsWith("image/")) continue; // photos only
    const jobNumber = d.job_number as string;
    const div = divByJob.get(jobNumber) ?? null;
    if (division && div !== division) continue;
    rows.push({
      documentId: d.id as string,
      jobNumber,
      division: div,
      fileName: (d.original_file_name as string) ?? null,
      bucket: (d.storage_bucket as string) ?? null,
      path: (d.storage_path as string) ?? null,
      sha256: (d.file_sha256 as string) ?? null,
      phash: (d.phash as string) ?? null,
      dhash: (d.dhash as string) ?? null,
    });
  }
  return rows;
}

function perceptualMatch(a: PhotoRow, b: PhotoRow): "exact" | "perceptual" | null {
  if (a.sha256 && b.sha256 && a.sha256 === b.sha256) return "exact";
  const r = DEFAULT_PHOTO_DEDUPE_RULES;
  const pd = hammingHex(a.phash, b.phash);
  const dd = hammingHex(a.dhash, b.dhash);
  if (pd <= r.phashMax && dd <= r.dhashMax) return "perceptual";
  return null;
}

/** Build clusters via Union-Find; keep only clusters spanning ≥2 distinct job codes. */
function buildClusters(
  rows: PhotoRow[],
  matcher: (a: PhotoRow, b: PhotoRow) => "exact" | "perceptual" | null,
): JobPhotoDuplicateCluster[] {
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

  const clusters: JobPhotoDuplicateCluster[] = [];
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
      key: `hash-${root}`,
      basis,
      severity: basis === "exact" ? "High" : "Medium",
      jobCodes,
      divisions,
      sameDivisionReuse,
      photos: idxs.map((i) => ({
        documentId: rows[i]!.documentId,
        jobNumber: rows[i]!.jobNumber,
        division: rows[i]!.division,
        fileName: rows[i]!.fileName,
      })),
    });
  }
  // same-division reuse first, then larger clusters
  clusters.sort((a, b) => Number(b.sameDivisionReuse) - Number(a.sameDivisionReuse) || b.photos.length - a.photos.length);
  return clusters;
}

/** HASH-based cross-job duplicate clusters (digital reuse). */
export async function runJobPhotoDuplicateAudit(opts?: { division?: string }): Promise<JobPhotoDuplicateCluster[]> {
  const rows = await loadPhotoRows(opts?.division);
  return buildClusters(rows, perceptualMatch);
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

/** Download a photo's bytes — R2 by bare key (forensic imports) or Supabase Storage by bucket+path. */
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

/**
 * VISUAL scan within a division: pairwise vision compare of photos from DIFFERENT
 * job codes that hashes did NOT already match (the print→scan case). Bounded by a
 * pair budget; verdicts cached in photo_match_verdicts so each pair is judged once.
 */
export async function scanDivisionVisualDuplicates(division: string): Promise<VisualScanResult> {
  const admin = createAdminClient();
  const rows = (await loadPhotoRows(division)).filter((r) => r.path && r.bucket);
  if (rows.length < 2) return { ok: true, comparisons: 0, cached: 0, matches: [], capped: false };

  // Candidate pairs: different job codes, not already hash-identical.
  const pairs: [PhotoRow, PhotoRow][] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]!;
      const b = rows[j]!;
      if (a.jobNumber === b.jobNumber) continue;
      if (perceptualMatch(a, b)) continue; // hash already catches these
      pairs.push([a, b]);
    }
  }
  const capped = pairs.length > VISUAL_PAIR_BUDGET;
  const budgeted = pairs.slice(0, VISUAL_PAIR_BUDGET);

  const matches: VisualDuplicateMatch[] = [];
  let comparisons = 0;
  let cached = 0;
  for (const [a, b] of budgeted) {
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
      matches.push({
        a: { documentId: docA.documentId, jobNumber: docA.jobNumber, division: docA.division, fileName: docA.fileName },
        b: { documentId: docB.documentId, jobNumber: docB.jobNumber, division: docB.division, fileName: docB.fileName },
        confidence,
        sharedDetails,
        sameDivision: docA.division != null && docA.division === docB.division,
      });
    }
  }
  return { ok: true, comparisons, cached, matches, capped };
}
