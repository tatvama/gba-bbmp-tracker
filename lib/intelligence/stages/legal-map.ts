import type { Observation, ComplianceItem, LegalRef } from "../types";

/**
 * Stage 6 — Legal / Rule Mapping (deterministic, REUSE). Dedups the rule
 * references already carried on each Observation (resolved in analyze.ts from
 * finding.ruleRef or STATUTE_MAP by code prefix) PLUS each unconditional
 * compliance item's ruleRef (from document-facts.ts — AA/TS/KW-4/MDP/etc.,
 * present or not) into a distinct Applicable Legal Framework. Lookup only — no
 * generation, so nothing is invented.
 */
export function buildLegalFramework(findings: Observation[], compliance: ComplianceItem[] = []): LegalRef[] {
  const byInstrument = new Map<string, Set<string>>();
  const add = (instrument: string, tag: string) => {
    if (!instrument) return;
    const tags = byInstrument.get(instrument) ?? byInstrument.set(instrument, new Set()).get(instrument)!;
    if (tag) tags.add(tag);
  };
  for (const f of findings) for (const ref of f.ruleRefs) add(ref, f.code ?? "");
  for (const c of compliance) if (c.ruleRef) add(c.ruleRef, c.area);

  const out: LegalRef[] = [];
  for (const [instrument, tags] of byInstrument) {
    out.push({
      instrument,
      relevance: tags.size ? `Basis for: ${[...tags].join(", ")}` : "Applicable to this case",
      // Keys the graph matches on: the instrument string itself (Observation.ruleRefs
      // hold instrument strings) plus the finding codes / compliance areas it governs.
      ruleRefKeys: [instrument, ...tags],
    });
  }
  return out;
}
