/**
 * Tiered matcher: resolve ONE extracted acknowledgment to the EXISTING complaint
 * it acknowledges. Deterministic where we can be (Tier 1 — exact job code / BBMP
 * complaint number / internal case number), fuzzy where we must (Tier 2 — subject
 * + area + reporter similarity). Pure + synchronous so it is trivially unit-testable
 * and cheap to run over every section; the caller loads the complaint pool once.
 *
 * Confidence is deliberately conservative — a wrong acknowledgment on a legal
 * proof-of-receipt is worse than an unmatched one, so anything below the fuzzy
 * floor returns `none` (no proposal) and the human picks in the review screen.
 */
import type { DbClient } from "@/lib/db";
import type { ComplaintIntakeExtraction } from "@/lib/ai/complaint-intake-analyzer";
import type { AckMatchResult, MatchCandidate, MatchConfidence } from "@/lib/complaints/ack-reconcile";
import { extractJobCode } from "@/lib/ifms/downloader";

/** The identifier fields of an existing complaint we match against. */
export interface PoolComplaint {
  id: string;
  internal_case_number: string | null;
  complaint_number: string | null;
  job_number: string | null;
  title: string | null;
  location: string | null;
  reporter_name: string | null;
  status: string | null;
}

/** Extracted fields we can match on (subset of the intake extraction). */
export interface AckMatchInput {
  subject?: string | null;
  referenceNumber?: string | null;
  jobNumber?: string | null;
  areaOrWard?: string | null;
  reporterName?: string | null;
}

/** Loosely normalise an identifier for equality (drop spaces, punctuation, case). */
function normId(v: string | null | undefined): string {
  return (v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Lowercased word tokens (length ≥ 3) for fuzzy text overlap. Keeps non-latin
 *  (e.g. Kannada) runs whole so a Kannada subject still contributes tokens. */
function tokens(v: string | null | undefined): Set<string> {
  if (!v) return new Set();
  const cleaned = v.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ");
  const out = new Set<string>();
  for (const t of cleaned.split(/\s+/)) {
    if (t && (t.length >= 3 || /[^\x00-\x7f]/.test(t))) out.add(t);
  }
  return out;
}

/** Overlap coefficient (|A∩B| / min(|A|,|B|)) — robust when one side is short. */
function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let hits = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const t of small) if (big.has(t)) hits++;
  return hits / small.size;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Score every complaint in the pool against one extracted acknowledgment and
 * pick the best. Exact-identifier hits dominate; text similarity breaks ties and
 * carries the fuzzy-only case.
 */
export function scoreAckMatch(
  ex: AckMatchInput | Partial<ComplaintIntakeExtraction>,
  pool: PoolComplaint[],
): AckMatchResult {
  const exJob = extractJobCode(ex.jobNumber) || extractJobCode(ex.referenceNumber);
  const refNorm = normId(ex.referenceNumber);
  const subjTokens = tokens(ex.subject);
  const areaTokens = tokens(ex.areaOrWard);
  const reporterTokens = tokens(ex.reporterName);

  const scored: MatchCandidate[] = [];
  let exactIdHits = 0;

  for (const c of pool) {
    const reasons: string[] = [];
    let score = 0;
    let exactId = false;

    // ── Tier 1: exact identifiers ────────────────────────────────────────────
    const cJob = extractJobCode(c.job_number);
    if (exJob && cJob && exJob === cJob) {
      score += 0.6;
      exactId = true;
      reasons.push(`Exact job code ${exJob}`);
    }
    if (refNorm && refNorm.length >= 4) {
      if (normId(c.complaint_number) === refNorm) {
        score += 0.6;
        exactId = true;
        reasons.push(`BBMP complaint no. ${c.complaint_number}`);
      } else if (normId(c.internal_case_number) === refNorm) {
        score += 0.6;
        exactId = true;
        reasons.push(`Internal ref ${c.internal_case_number}`);
      }
    }

    // ── Tier 2: fuzzy text ───────────────────────────────────────────────────
    const titleTokens = tokens(c.title);
    const subjSim = overlap(subjTokens, titleTokens);
    if (subjSim > 0) {
      score += subjSim * 0.4;
      if (subjSim >= 0.4) reasons.push(`Subject ${Math.round(subjSim * 100)}% match`);
    }
    const locTokens = tokens(`${c.location ?? ""} ${c.title ?? ""}`);
    const areaSim = overlap(areaTokens, locTokens);
    if (areaSim >= 0.5) {
      score += 0.15;
      reasons.push("Same area/ward");
    }
    const reporterSim = overlap(reporterTokens, tokens(c.reporter_name));
    if (reporterSim >= 0.5) {
      score += 0.12;
      reasons.push("Same complainant");
    }

    if (exactId) exactIdHits++;
    if (score > 0) {
      scored.push({
        complaintId: c.id,
        caseNumber: c.internal_case_number,
        complaintNumber: c.complaint_number,
        jobNumber: c.job_number,
        title: c.title,
        location: c.location,
        status: c.status,
        score: round(Math.min(1, score)),
        reasons,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const candidates = scored.slice(0, 4);
  const top = candidates[0];
  const second = candidates[1];

  if (!top) return { proposedComplaintId: null, confidence: "none", candidates: [] };

  // A unique exact-identifier hit is the strong case. If several complaints share
  // the same job code (work-splitting!), it is only ambiguous → medium, human picks.
  const topIsExact = top.reasons.some((r) => /^(Exact job code|BBMP complaint|Internal ref)/.test(r));
  let confidence: MatchConfidence;
  if (topIsExact && exactIdHits === 1) confidence = "high";
  else if (topIsExact) confidence = "medium";
  else if (exJob) {
    // A job code was clearly extracted but doesn't exist on ANY tracked
    // complaint — BBMP job codes are specific enough that a fuzzy subject/area
    // guess is more likely to attach the acknowledgment to the WRONG complaint
    // than to help (generic words like "road"/"drain"/"ward" overlap across
    // totally unrelated jobs). Treat as unmatched so the reviewer creates the
    // complaint instead of getting a misleading low/medium-confidence pick.
    confidence = "none";
  } else if (top.score >= 0.5 && (!second || top.score - second.score >= 0.15)) confidence = "medium";
  else if (top.score >= 0.3) confidence = "low";
  else confidence = "none";

  return {
    proposedComplaintId: confidence === "none" ? null : top.complaintId,
    confidence,
    candidates,
  };
}

/**
 * Load the identifier columns of every complaint once, for in-memory matching.
 * A few thousand rows of ~7 short columns is tiny; matching all sections against
 * one pool avoids N queries per acknowledgment.
 *
 * `max` used to default to 5000 with no ORDER BY — once the table grew past
 * that, a plain `LIMIT` with no ordering could silently drop an arbitrary
 * subset of rows (Postgres gives no ordering guarantee without one), so a
 * job code that genuinely exists in `complaints` could stop being found for
 * no reason visible in the UI. Raised well past any real complaint count and
 * ordered so a future truncation drops the oldest (least likely relevant)
 * rows first, deterministically, instead of an unspecified subset.
 */
export async function loadComplaintPool(admin: DbClient, max = 50_000): Promise<PoolComplaint[]> {
  // IMPORTANT: every column here must exist on `complaints`. PostgREST fails the
  // WHOLE query if ONE column is unknown — and this function used to also select
  // `reporter_name`, which no migration ever added, so the query errored on every
  // call and the old `if (error) return []` swallowed it silently. The pool was
  // therefore EMPTY in production and NO acknowledgment ever auto-matched, with
  // nothing logged to explain it. `reporter_name` is only a weak fuzzy tiebreaker
  // in scoreAckMatch, so it is dropped from the pool (mapped to null) rather than
  // risk the whole pool again; job code + subject + area carry the match. Errors
  // are now logged loudly instead of hidden.
  const { data, error } = await admin
    .from("complaints")
    .select("id, internal_case_number, complaint_number, job_number, title, location, status")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(max);
  if (error) {
    console.error("[loadComplaintPool] complaint pool query FAILED — ack matching will find nothing:", error.message);
    return [];
  }
  const rows = (data ?? []) as Omit<PoolComplaint, "reporter_name">[];
  return rows.map((c) => ({ ...c, reporter_name: null }));
}

/**
 * Which of these complaints already have an acknowledgment attached? Used to
 * skip re-processing / re-attaching a duplicate acknowledgment for a complaint
 * that has already been acknowledged. The signal is the presence of a
 * "Complaint acknowledgement" document (exactly what both ack flows create via
 * attachAcknowledgmentDocument) — precise, unlike acknowledgment_date which
 * other flows can also set. Pass the specific complaint ids to check (e.g. the
 * ids in the current pool) to keep the query small.
 */
export async function loadAcknowledgedComplaintIds(
  admin: DbClient,
  complaintIds?: string[],
): Promise<Set<string>> {
  if (complaintIds && complaintIds.length === 0) return new Set();
  let q = admin
    .from("complaint_documents")
    .select("complaint_id")
    .eq("document_type", "Complaint acknowledgement");
  if (complaintIds) q = q.in("complaint_id", complaintIds);
  const { data, error } = await q;
  if (error) {
    console.error("[loadAcknowledgedComplaintIds] query failed:", error.message);
    return new Set();
  }
  return new Set((data ?? []).map((r) => (r as { complaint_id: string }).complaint_id).filter(Boolean));
}
