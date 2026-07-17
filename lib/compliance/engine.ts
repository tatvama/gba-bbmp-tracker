/**
 * Engineering Compliance engine — a generic, deterministic evaluator that runs
 * the Engineering Compliance Matrix over a CaseIntelligence artifact. Pure
 * projection: it reads the artifact (the single source of truth) and never
 * re-parses documents or calls the AI. Reusable by letter serialization, the
 * Evidence Dossier, and any future compliance surface.
 */
import type { CaseIntelligence } from "@/lib/intelligence/types";
import { toComplianceInput, type ComplianceFinding, type RuleContext } from "./types";
import { ENGINEERING_COMPLIANCE_MATRIX } from "./matrix";

/** Evaluate every applicable compliance dimension against the artifact. */
export function runComplianceMatrix(intel: CaseIntelligence, ctx: RuleContext = {}): ComplianceFinding[] {
  const input = toComplianceInput(intel);
  return ENGINEERING_COMPLIANCE_MATRIX.filter((rule) => rule.appliesTo(ctx)).map((rule) => rule.evaluate(input, ctx));
}

const STATUS_RANK: Record<string, number> = { discrepancy: 0, not_shown: 1, unknown: 2, met: 3, not_applicable: 4 };

/** Matrix sorted worst-first (discrepancies, then gaps, then met) for display. */
export function runComplianceMatrixRanked(intel: CaseIntelligence, ctx: RuleContext = {}): ComplianceFinding[] {
  const sevRank: Record<string, number> = { High: 0, Medium: 1, Low: 2, Info: 3 };
  return runComplianceMatrix(intel, ctx).sort((a, b) => {
    const s = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
    return s !== 0 ? s : (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9);
  });
}

/** One-line rollup for headers / badges. */
export function complianceSummary(findings: ComplianceFinding[]): {
  discrepancy: number;
  notShown: number;
  met: number;
  total: number;
} {
  let discrepancy = 0;
  let notShown = 0;
  let met = 0;
  for (const f of findings) {
    if (f.status === "discrepancy") discrepancy++;
    else if (f.status === "not_shown") notShown++;
    else if (f.status === "met") met++;
  }
  return { discrepancy, notShown, met, total: findings.length };
}
