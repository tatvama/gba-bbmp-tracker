/**
 * Validation — the "never invent" guarantee, in two parts (plan §12):
 *
 *  1. validateKnowledgeBase()  — catalog self-check (build/test time). Proves the
 *     curated data is internally sound: unique ids, sound provisions, a section
 *     number only where confidence is High, superseded markers point at a real
 *     active successor, and every active entry is reachable by the resolver.
 *
 *  2. validateDraftCitations() — post-draft detection (runtime, WARN not block).
 *     Flags any statute-shaped citation in the generated letter that is NOT backed
 *     by the resolved framework OR grounded in the provided context/case history.
 *     Mirrors the existing safe-language linter, which also warns rather than blocks.
 */
import type { LegalReference, ResolvedLegalFramework } from "@/lib/legal/types";

const INSTRUMENT_KINDS = new Set(["Act", "Rules", "Bye-law", "Regulation", "Sanhita", "Order"]);

/** Returns a list of human-readable issues; empty means the catalog is sound. */
export function validateKnowledgeBase(catalog: LegalReference[]): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  const allActiveIds = new Set(catalog.filter((r) => !r.supersededBy).map((r) => r.id));

  for (const r of catalog) {
    const at = `[${r.id || "?"}]`;
    if (!r.id) issues.push(`${at} missing id`);
    if (ids.has(r.id)) issues.push(`${at} duplicate id`);
    ids.add(r.id);

    if (!r.instrument) issues.push(`${at} missing instrument`);
    if (!Number.isInteger(r.year) || r.year < 1850 || r.year > 2100) {
      issues.push(`${at} implausible year: ${r.year}`);
    }
    if (!INSTRUMENT_KINDS.has(r.kind)) issues.push(`${at} invalid kind: ${r.kind}`);
    if (!r.authorities?.length) issues.push(`${at} no authorities`);
    if (!Array.isArray(r.categories)) issues.push(`${at} categories must be an array`);
    if (!Array.isArray(r.keywords)) issues.push(`${at} keywords must be an array`);
    if (!r.reason) issues.push(`${at} missing reason (explainability)`);

    if (r.supersededBy) {
      if (!allActiveIds.has(r.supersededBy)) {
        issues.push(`${at} supersededBy "${r.supersededBy}" is not an active reference`);
      }
      // Superseded entries are excluded from the active set; skip the deeper
      // reachability / provision checks that only matter for citable law.
      continue;
    }

    // Reachability: an active reference must be selectable by the resolver via a
    // category, a keyword, or a specific (non-default) authority.
    const hasSpecificAuthority = r.authorities.some(
      (a) => a !== "BBMP" && a !== "GBA" && a !== "Any",
    );
    if (!r.categories.length && !r.keywords.length && !hasSpecificAuthority) {
      issues.push(`${at} unreachable: no categories, keywords, or specific authority`);
    }

    if (!r.provisions?.length) {
      issues.push(`${at} has no provisions`);
      continue;
    }
    for (const [i, p] of r.provisions.entries()) {
      const pat = `${at} provision[${i}]`;
      if (!p.obligation) issues.push(`${pat} missing obligation`);
      if (!p.template) issues.push(`${pat} missing template`);
      if (!p.confidence) issues.push(`${pat} missing confidence`);
      // A specific section/rule number may only be asserted at High confidence.
      if (p.ref && p.confidence !== "High") {
        issues.push(`${pat} cites "${p.ref}" at ${p.confidence} confidence (sections require High)`);
      }
    }
  }
  return issues;
}

interface InstrumentCitation {
  raw: string;
  nameTokens: Set<string>;
  year: number;
}

const CITATION_STOPWORDS = new Set([
  "act", "acts", "rules", "rule", "the", "and", "for", "of", "sanhita", "bye", "byelaws",
  "byelaw", "regulation", "regulations", "order", "under", "section", "sections",
]);

/** Significant lowercase word tokens (length >= 4, non-stopword) of an instrument name. */
function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !CITATION_STOPWORDS.has(w)),
  );
}

/** Extract "<Name> Act|Rules|Sanhita|Bye-laws, YYYY" style citations from text. */
function extractInstrumentCitations(text: string): InstrumentCitation[] {
  const out: InstrumentCitation[] = [];
  const re = /([A-Z][A-Za-z'()./&,\- ]{3,90}?\b(?:Act|Rules|Sanhita|Bye-?laws?|Regulations?))\,?\s*(\d{4})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const name = m[1];
    const yr = m[2];
    if (!name || !yr) continue;
    out.push({ raw: `${name.trim()}, ${yr}`, nameTokens: nameTokens(name), year: Number(yr) });
  }
  return out;
}

function tokensOverlap(a: Set<string>, b: Set<string>): boolean {
  for (const t of a) if (b.has(t)) return true;
  return false;
}

/**
 * Detects statute-shaped citations in a generated letter that are not backed by
 * the resolved framework or grounded in the provided context. Returns warnings
 * (never throws). `contextText` should be the full drafting context so that any
 * instrument named there (framework OR case history) is treated as allowed.
 */
export function validateDraftCitations(
  text: string,
  resolved: ResolvedLegalFramework | null,
  opts: { contextText?: string; allowInstruments?: string[] } = {},
): string[] {
  // Allowed instruments = the resolved framework + anything cited in the context
  // (case history / evidence) + any explicit allowances (e.g. PIL whitelist).
  const allowed: { tokens: Set<string>; year: number }[] = [];
  for (const r of resolved?.references ?? []) {
    allowed.push({ tokens: nameTokens(r.reference.instrument), year: r.reference.year });
  }
  for (const c of extractInstrumentCitations(opts.contextText ?? "")) {
    allowed.push({ tokens: c.nameTokens, year: c.year });
  }
  for (const name of opts.allowInstruments ?? []) {
    const yearMatch = name.match(/(\d{4})/);
    allowed.push({ tokens: nameTokens(name), year: yearMatch ? Number(yearMatch[1]) : 0 });
  }

  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const cited of extractInstrumentCitations(text)) {
    if (seen.has(cited.raw)) continue;
    seen.add(cited.raw);
    const overlapping = allowed.filter((a) => tokensOverlap(a.tokens, cited.nameTokens));
    if (!overlapping.length) {
      warnings.push(`Cited "${cited.raw}" is not in the provided legal framework or context.`);
    } else if (cited.year && !overlapping.some((a) => a.year === cited.year)) {
      warnings.push(`Cited "${cited.raw}" — the year does not match the provided reference.`);
    }
  }
  return warnings;
}
