/**
 * Resolver — deterministic, multi-factor, no AI / vector / semantic search.
 *
 * Turns a complaint DTO into a ranked, deduplicated, reasoning-backed set of
 * applicable legal references. Pipeline (plan §7):
 *   authority gate → relevance signal → Low-priority guard → confidence/provision
 *   filter → effective-priority boost → merge same instrument → rank → cap.
 *
 * Runs once per draft over a small in-memory catalog: O(references × keywords),
 * negligible latency.
 */
import type {
  LegalConfidence,
  LegalPriority,
  LegalProvision,
  LegalReference,
  LegalResolutionContext,
  ResolvedLegalFramework,
  ResolvedReference,
  ResolutionTraceEntry,
} from "@/lib/legal/types";
import type { KnowledgeBaseProvider } from "@/lib/legal/knowledge/provider";
import { getKnowledgeBase } from "@/lib/legal/knowledge";

/** Max references surfaced to the drafting engine — quality over quantity. */
export const MAX_REFERENCES = 8;

const PRIORITY_RANK: Record<LegalPriority, number> = { High: 3, Medium: 2, Low: 1 };
const CONFIDENCE_RANK: Record<LegalConfidence, number> = { High: 3, Medium: 2, Low: 1 };
const DEFAULT_AUTHORITIES = new Set(["BBMP", "GBA", "Any"]);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\&-]/g, "\\$&");
}

/** Whole-word / phrase match, so "tar" does not hit "start". */
function matchesKeyword(haystack: string, keyword: string): boolean {
  return new RegExp(`\\b${escapeRegex(keyword.toLowerCase())}\\b`).test(haystack);
}

function buildHaystack(dto: LegalResolutionContext): string {
  return [
    dto.title,
    dto.subtype,
    dto.classifiedCategory,
    dto.description,
    dto.requestedAction,
    dto.location,
    dto.caseHistoryText,
  ]
    .filter(Boolean)
    .join(" \n ")
    .toLowerCase();
}

/** A provision applies if it is unscoped, or its category/keyword scope matches. */
function provisionInScope(p: LegalProvision, dto: LegalResolutionContext, hay: string): boolean {
  const hasScope = Boolean(p.categories?.length || p.keywords?.length);
  if (!hasScope) return true;
  if (p.categories?.includes(dto.type)) return true;
  if (p.keywords?.some((k) => matchesKeyword(hay, k))) return true;
  return false;
}

export function resolveLegalFramework(
  dto: LegalResolutionContext,
  provider: KnowledgeBaseProvider = getKnowledgeBase(),
): ResolvedLegalFramework {
  const hay = buildHaystack(dto);
  const trace: ResolutionTraceEntry[] = [];
  const kept: ResolvedReference[] = [];

  for (const ref of provider.all()) {
    // 1. Authority gate — the letter's recipient must be governed by this instrument.
    const authorityGate = ref.authorities.includes(dto.receivingAuthority) || ref.authorities.includes("Any");
    if (!authorityGate) {
      trace.push({ id: ref.id, decision: "dropped", reasonInternal: `authority ${dto.receivingAuthority} not governed by this instrument` });
      continue;
    }

    // 2. Relevance signal — category, keyword, or a specific (non-default) authority.
    const categoryMatch = ref.categories.includes(dto.type);
    const keywordHits = ref.keywords.filter((k) => matchesKeyword(hay, k));
    const specificAuthoritySignal = !DEFAULT_AUTHORITIES.has(dto.receivingAuthority) && ref.authorities.includes(dto.receivingAuthority);
    if (!categoryMatch && keywordHits.length === 0 && !specificAuthoritySignal) {
      trace.push({ id: ref.id, decision: "dropped", reasonInternal: "no relevance signal (category/keyword/authority)" });
      continue;
    }

    // 3. Low-priority guard — a Low reference needs an explicit keyword/fact, not just a category.
    if (ref.priority === "Low" && keywordHits.length === 0 && !specificAuthoritySignal) {
      trace.push({ id: ref.id, decision: "dropped", reasonInternal: "Low priority without specific fact support" });
      continue;
    }

    // 4. Confidence + provision-scope filter — never cite a Low-confidence provision.
    const provisions = ref.provisions.filter((p) => p.confidence !== "Low" && provisionInScope(p, dto, hay));
    if (!provisions.length) {
      trace.push({ id: ref.id, decision: "dropped", reasonInternal: "no in-scope, sufficiently-confident provision" });
      continue;
    }

    // 5. Effective priority — a direct keyword/authority hit promotes to High.
    const boosted = keywordHits.length > 0 || specificAuthoritySignal;
    const effectivePriority: LegalPriority = boosted ? "High" : ref.priority;

    const matchedFactors: string[] = [];
    if (categoryMatch) matchedFactors.push(`category:${dto.type}`);
    for (const k of keywordHits) matchedFactors.push(`keyword:${k}`);
    if (specificAuthoritySignal) matchedFactors.push(`authority:${dto.receivingAuthority}`);
    if (dto.hasForensicFindings) matchedFactors.push("evidence:findings");

    const score = (categoryMatch ? 2 : 0) + keywordHits.length * 3 + (specificAuthoritySignal ? 2 : 0);
    kept.push({ reference: ref, provisions, effectivePriority, matchedFactors });
    trace.push({ id: ref.id, decision: "included", reasonInternal: matchedFactors.join(", ") || "matched", effectivePriority, score });
  }

  const merged = mergeByInstrument(kept, hay, dto);
  merged.sort(compareResolved);

  let truncated: number | undefined;
  let references = merged;
  if (merged.length > MAX_REFERENCES) {
    truncated = merged.length - MAX_REFERENCES;
    references = merged.slice(0, MAX_REFERENCES);
    console.warn(`[legal] capped legal framework at ${MAX_REFERENCES}; dropped ${truncated} lower-ranked reference(s).`);
  }

  return { version: provider.version, references, trace, truncated };
}

/** Merge references that are the SAME instrument (name + year): union provisions,
 *  keep the highest effective priority, merge matched factors. In v1 the catalog
 *  has one entry per instrument, so this is a no-op — but it keeps the engine
 *  correct if a future module adds another entry for the same Act. */
function mergeByInstrument(refs: ResolvedReference[], _hay: string, _dto: LegalResolutionContext): ResolvedReference[] {
  const byKey = new Map<string, ResolvedReference>();
  for (const r of refs) {
    const key = `${r.reference.instrument.toLowerCase()}__${r.reference.year}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...r, provisions: [...r.provisions], matchedFactors: [...r.matchedFactors] });
      continue;
    }
    for (const p of r.provisions) {
      const dup = existing.provisions.some((e) => e.ref === p.ref && e.obligation === p.obligation);
      if (!dup) existing.provisions.push(p);
    }
    if (PRIORITY_RANK[r.effectivePriority] > PRIORITY_RANK[existing.effectivePriority]) {
      existing.effectivePriority = r.effectivePriority;
    }
    for (const f of r.matchedFactors) if (!existing.matchedFactors.includes(f)) existing.matchedFactors.push(f);
  }
  return [...byKey.values()];
}

function compareResolved(a: ResolvedReference, b: ResolvedReference): number {
  const p = PRIORITY_RANK[b.effectivePriority] - PRIORITY_RANK[a.effectivePriority];
  if (p !== 0) return p;
  const c = CONFIDENCE_RANK[b.reference.confidence] - CONFIDENCE_RANK[a.reference.confidence];
  if (c !== 0) return c;
  const factors = b.matchedFactors.length - a.matchedFactors.length;
  if (factors !== 0) return factors;
  const year = b.reference.year - a.reference.year;
  if (year !== 0) return year;
  return a.reference.id.localeCompare(b.reference.id); // stable, deterministic
}
