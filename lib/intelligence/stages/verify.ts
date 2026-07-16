import type { Evidence, Observation, Synthesis, VerificationReport } from "../types";

/**
 * Stage 8 — Groundedness gate (deterministic). Enforces the evidence rule: every
 * Observation must have ≥1 live evidence id, and every synthesis suspicion/
 * contradiction may only cite observation ids that exist. Invalid references are
 * pruned (not silently kept) and reported. This is the structural hallucination
 * guard — more reliable for "every statement has evidence" than an AI self-check.
 */
export function verifyGroundedness(input: {
  evidence: Evidence[];
  findings: Observation[];
  correlations: Observation[];
  synthesis: Synthesis;
}): { report: VerificationReport; synthesis: Synthesis } {
  const evidenceIds = new Set(input.evidence.map((e) => e.id));
  const allObs = [...input.findings, ...input.correlations];
  const obsIds = new Set(allObs.map((o) => o.id));

  const ungroundedClaims: string[] = [];
  let grounded = 0;
  for (const o of allObs) {
    const hasEvidence = o.evidenceIds.some((id) => evidenceIds.has(id));
    if (hasEvidence) grounded++;
    else ungroundedClaims.push(`${o.code ?? o.id}: ${o.statement.slice(0, 100)}`);
  }

  const notes: string[] = [];
  const prune = (ids: string[], where: string): string[] => {
    const valid = ids.filter((id) => obsIds.has(id));
    if (valid.length < ids.length) notes.push(`${where}: dropped ${ids.length - valid.length} non-existent observation reference(s)`);
    return valid;
  };
  const synthesis: Synthesis = {
    ...input.synthesis,
    prioritizedSuspicions: input.synthesis.prioritizedSuspicions.map((s) => ({ ...s, observationIds: prune(s.observationIds, "suspicion") })),
    contradictions: input.synthesis.contradictions.map((c) => ({ ...c, observationIds: prune(c.observationIds, "contradiction") })),
  };

  const report: VerificationReport = {
    passed: ungroundedClaims.length === 0,
    groundedCount: grounded,
    ungroundedClaims,
    numericMismatches: [], // deterministic engine already computed figures; nothing to re-derive
    notes,
  };
  return { report, synthesis };
}
