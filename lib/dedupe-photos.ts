import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPhotoDedupeRules } from "@/lib/settings";
import { hammingHex, type PhotoFingerprint } from "@/lib/ocr/image-fingerprint";
import type { PhotoDedupeRules } from "@/lib/constants";

/**
 * Duplicate-photo detection. Compares image fingerprints (SHA-256 + pHash/dHash +
 * EXIF GPS/time) ACROSS different complaints/jobs to flag reuse — the contractor
 * fraud of submitting the same Before/During/After photo for different roads,
 * usually within one engineering division. Findings are suspicions for human
 * review, never automated accusations.
 */

export type DupSeverity = "High" | "Medium" | "Low";

export interface PhotoMatch {
  documentId: string;
  complaintId: string;
  jobNumber: string | null;
  caseNumber: string | null;
  road: string | null;
  divisionId: string | null;
  division: string | null;
  corporation: string | null;
  documentType: string | null;
  photoStage: string | null;
  uploadedAt: string | null;
  matchType: "exact" | "perceptual" | "exif";
  severity: DupSeverity;
  sameDivision: boolean;
}

const FETCH_CAP = 4000;

/** complaint_documents + parent complaint context, for fingerprint comparison. */
const DOC_FP_SELECT =
  "id, complaint_id, file_sha256, phash, dhash, exif_gps_lat, exif_gps_lon, exif_taken_at, document_type, photo_stage, storage_bucket, storage_path, thumbnail_storage_path, uploaded_at, complaint:complaints!complaint_id(job_number, internal_case_number, location, division_id, division:divisions!division_id(name), corporation:corporations!corporation_id(name))";

export function deriveStage(documentType: string | null | undefined): string {
  const t = (documentType ?? "").toLowerCase();
  if (t.includes("before")) return "before";
  if (t.includes("after")) return "after";
  if (t.includes("progress") || t.includes("during") || t.includes("inspection")) return "during";
  return "na";
}

function gpsClose(
  aLat: number | null,
  aLon: number | null,
  bLat: number | null | undefined,
  bLon: number | null | undefined,
  eps: number,
): boolean {
  if (aLat == null || aLon == null || bLat == null || bLon == null) return false;
  return Math.abs(aLat - bLat) <= eps && Math.abs(aLon - bLon) <= eps;
}

/** Compare a fingerprint to a candidate row; return match type + severity, or null. */
function compare(
  fp: PhotoFingerprint,
  cand: { file_sha256?: string | null; phash?: string | null; dhash?: string | null; exif_gps_lat?: number | null; exif_gps_lon?: number | null; exif_taken_at?: string | null },
  rules: PhotoDedupeRules,
): { matchType: "exact" | "perceptual" | "exif"; severity: DupSeverity } | null {
  if (fp.sha256 && cand.file_sha256 && fp.sha256 === cand.file_sha256) {
    return { matchType: "exact", severity: "High" };
  }
  const pd = hammingHex(fp.phash, cand.phash);
  const dd = hammingHex(fp.dhash, cand.dhash);
  const perceptual = fp.phash != null && cand.phash != null && pd <= rules.phashMax && dd <= rules.dhashMax;
  const gpsHit = gpsClose(fp.gpsLat, fp.gpsLon, cand.exif_gps_lat, cand.exif_gps_lon, rules.gpsEpsilon);
  const timeHit = !!fp.takenAt && !!cand.exif_taken_at && fp.takenAt === cand.exif_taken_at;

  if (perceptual) {
    const strict = pd <= rules.strictMax && dd <= rules.strictMax;
    return { matchType: "perceptual", severity: strict || (gpsHit && timeHit) ? "High" : "Medium" };
  }
  if (gpsHit && timeHit) return { matchType: "exif", severity: "High" };
  if (gpsHit) return { matchType: "exif", severity: "Low" };
  return null;
}

function mapMatch(row: any, m: { matchType: "exact" | "perceptual" | "exif"; severity: DupSeverity }, divisionId: string | null): PhotoMatch {
  const c = row.complaint ?? {};
  return {
    documentId: row.id,
    complaintId: row.complaint_id,
    jobNumber: c.job_number ?? null,
    caseNumber: c.internal_case_number ?? null,
    road: c.location ?? null,
    divisionId: c.division_id ?? null,
    division: c.division?.name ?? null,
    corporation: c.corporation?.name ?? null,
    documentType: row.document_type ?? null,
    photoStage: row.photo_stage ?? null,
    uploadedAt: row.uploaded_at ?? null,
    matchType: m.matchType,
    severity: m.severity,
    sameDivision: !!divisionId && c.division_id === divisionId,
  };
}

/**
 * Find existing photos that match `fp`, excluding the photo's own complaint.
 * Every result is therefore a different case (and usually a different job).
 */
export async function findPhotoMatches(
  fp: PhotoFingerprint,
  opts: { excludeComplaintId: string; divisionId?: string | null },
): Promise<PhotoMatch[]> {
  const admin = createAdminClient();
  const rules = await getPhotoDedupeRules();
  const byId = new Map<string, PhotoMatch>();

  // 1) Exact SHA (indexed, unbounded) — catch byte-identical reuse anywhere.
  if (fp.sha256) {
    const { data } = await admin
      .from("complaint_documents")
      .select(DOC_FP_SELECT)
      .eq("file_sha256", fp.sha256)
      .neq("complaint_id", opts.excludeComplaintId)
      .limit(200);
    for (const row of data ?? []) {
      byId.set((row as { id: string }).id, mapMatch(row, { matchType: "exact", severity: "High" }, opts.divisionId ?? null));
    }
  }

  // 2) Perceptual + EXIF — scan a bounded candidate set (most recent first).
  const { data: cands } = await admin
    .from("complaint_documents")
    .select(DOC_FP_SELECT)
    .neq("complaint_id", opts.excludeComplaintId)
    .not("phash", "is", null)
    .order("uploaded_at", { ascending: false })
    .limit(FETCH_CAP);
  for (const row of cands ?? []) {
    const id = (row as { id: string }).id;
    if (byId.has(id)) continue;
    const m = compare(fp, row as Record<string, unknown>, rules);
    if (m) byId.set(id, mapMatch(row, m, opts.divisionId ?? null));
  }

  return [...byId.values()].sort((a, b) => sevRank(b.severity) - sevRank(a.severity));
}

function sevRank(s: DupSeverity): number {
  return s === "High" ? 3 : s === "Medium" ? 2 : 1;
}

// ── audit (cluster all reuse) ────────────────────────────────────────────────

export interface ClusterEntry {
  documentId: string;
  complaintId: string;
  jobNumber: string | null;
  caseNumber: string | null;
  road: string | null;
  divisionId: string | null;
  division: string | null;
  corporation: string | null;
  photoStage: string | null;
  bucket: string;
  thumbPath: string | null;
  storagePath: string;
  uploadedAt: string | null;
}

export interface ClusterDivision {
  divisionId: string | null;
  division: string | null;
  corporation: string | null;
  jobs: { jobNumber: string | null; road: string | null; caseNumber: string | null }[];
}

export interface DuplicateCluster {
  severity: DupSeverity;
  matchType: "exact" | "perceptual";
  entries: ClusterEntry[];
  divisions: ClusterDivision[];
  sameDivisionReuse: boolean;
  capped?: boolean;
}

class UnionFind {
  parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      const p = this.parent[x]!;
      this.parent[x] = this.parent[p]!; // path halving
      x = this.parent[x]!;
    }
    return x;
  }
  union(a: number, b: number) {
    this.parent[this.find(a)] = this.find(b);
  }
}

/** Scan all fingerprinted photos and cluster reuse spanning >1 case/job. */
export async function runDuplicatePhotoAudit(): Promise<DuplicateCluster[]> {
  const admin = createAdminClient();
  const rules = await getPhotoDedupeRules();
  const { data } = await admin
    .from("complaint_documents")
    .select(DOC_FP_SELECT)
    .or("phash.not.is.null,file_sha256.not.is.null")
    .order("uploaded_at", { ascending: false })
    .limit(FETCH_CAP);

  const docs = (data ?? []) as any[];
  const n = docs.length;
  const capped = n >= FETCH_CAP;
  if (n < 2) return [];

  const uf = new UnionFind(n);

  // Exact SHA edges via a hash map (cheap).
  const shaGroups = new Map<string, number[]>();
  docs.forEach((d, i) => {
    if (d.file_sha256) {
      const g = shaGroups.get(d.file_sha256) ?? [];
      g.push(i);
      shaGroups.set(d.file_sha256, g);
    }
  });
  for (const g of shaGroups.values()) {
    for (let k = 1; k < g.length; k++) uf.union(g[0]!, g[k]!);
  }

  // Perceptual edges (O(n²) on the bounded set).
  const clusterMatchType = new Map<number, "exact" | "perceptual">();
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (uf.find(i) === uf.find(j)) continue;
      const pd = hammingHex(docs[i].phash, docs[j].phash);
      const dd = hammingHex(docs[i].dhash, docs[j].dhash);
      if (docs[i].phash && docs[j].phash && pd <= rules.phashMax && dd <= rules.dhashMax) {
        uf.union(i, j);
        clusterMatchType.set(uf.find(i), "perceptual");
      }
    }
  }

  // Gather clusters.
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = uf.find(i);
    const g = groups.get(r) ?? [];
    g.push(i);
    groups.set(r, g);
  }

  const clusters: DuplicateCluster[] = [];
  for (const [root, members] of groups.entries()) {
    if (members.length < 2) continue;
    const distinctCases = new Set(members.map((i) => docs[i].complaint_id));
    if (distinctCases.size < 2) continue; // same case re-upload is not fraud

    const entries: ClusterEntry[] = members.map((i) => {
      const d = docs[i];
      const c = d.complaint ?? {};
      return {
        documentId: d.id,
        complaintId: d.complaint_id,
        jobNumber: c.job_number ?? null,
        caseNumber: c.internal_case_number ?? null,
        road: c.location ?? null,
        divisionId: c.division_id ?? null,
        division: c.division?.name ?? null,
        corporation: c.corporation?.name ?? null,
        photoStage: d.photo_stage ?? null,
        bucket: d.storage_bucket,
        thumbPath: d.thumbnail_storage_path ?? null,
        storagePath: d.storage_path,
        uploadedAt: d.uploaded_at ?? null,
      };
    });

    // Per-division breakdown.
    const divMap = new Map<string, ClusterDivision>();
    for (const e of entries) {
      const key = e.divisionId ?? "—";
      const dv = divMap.get(key) ?? { divisionId: e.divisionId, division: e.division, corporation: e.corporation, jobs: [] };
      if (!dv.jobs.some((j) => j.jobNumber === e.jobNumber && j.caseNumber === e.caseNumber)) {
        dv.jobs.push({ jobNumber: e.jobNumber, road: e.road, caseNumber: e.caseNumber });
      }
      divMap.set(key, dv);
    }
    const divisions = [...divMap.values()];
    const sameDivisionReuse = divisions.some((d) => d.jobs.length > 1);
    const matchType = clusterMatchType.get(root) ?? "exact";
    const severity: DupSeverity = matchType === "exact" ? "High" : sameDivisionReuse ? "High" : "Medium";

    clusters.push({ severity, matchType, entries, divisions, sameDivisionReuse, capped });
  }

  // Same-division reuse first, then larger clusters.
  return clusters.sort((a, b) => {
    if (a.sameDivisionReuse !== b.sameDivisionReuse) return a.sameDivisionReuse ? -1 : 1;
    return b.entries.length - a.entries.length;
  });
}

export interface ResponsibleOfficer {
  id: string;
  full_name: string;
  designation: string | null;
  role_level: string | null;
}

/** The AE/AEE/EE accountable for a division (ties duplicates to officers). */
export async function getDivisionResponsibleOfficers(divisionId: string): Promise<ResponsibleOfficer[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("contacts")
    .select("id, full_name, designation, role_level")
    .eq("division_id", divisionId)
    .in("role_level", ["EE", "AEE", "AE"])
    .order("role_level");
  return (data as ResponsibleOfficer[]) ?? [];
}
