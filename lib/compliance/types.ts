/**
 * Engineering Compliance context — types (framework-free). The Compliance Matrix
 * is a declarative registry of rules; the engine (engine.ts) is a generic
 * evaluator that PROJECTS over the existing CaseIntelligence artifact (the single
 * source of truth). Rules never re-parse documents and never call the AI — they
 * read already-extracted evidence, findings and compliance items.
 *
 * Adding a future engineering regulation is a single ComplianceRule descriptor
 * (Open/Closed), and every finding carries a uniform explainability contract so
 * the letter/dossier can always show status, reason, evidence, rule and action.
 */
import type {
  CaseIntelligence,
  ComplianceItem,
  Observation,
  Reference,
  InsuranceCoverage,
  ScheduleBTables,
  TvccCompliance,
} from "@/lib/intelligence/types";

export type ComplianceStatus = "met" | "not_shown" | "discrepancy" | "unknown" | "not_applicable";
export type ComplianceSeverity = "High" | "Medium" | "Low" | "Info";

/** Uniform, explainable result for one compliance dimension. */
export interface ComplianceFinding {
  key: string;
  label: string;
  category: string;
  status: ComplianceStatus;
  severity: ComplianceSeverity;
  reason: string;
  evidenceUsed: string[]; // evidence ids / reference values backing the status
  applicableRule: string; // ruleRef (administrative / statutory basis)
  confidence: "High" | "Medium" | "Low";
  recommendedAction: string | null;
  documentsRequired: string[];
  ruleVersion: string; // which rule version produced this (audit traceability)
}

/** Read-only projection of the CaseIntelligence artifact a rule may consult.
 *  A CaseIntelligence value structurally satisfies this (dependency inversion:
 *  the compliance context does not depend on the full artifact type/engine). */
export interface ComplianceInput {
  readonly compliance: ReadonlyArray<ComplianceItem>;
  readonly findings: ReadonlyArray<Observation>;
  readonly correlations: ReadonlyArray<Observation>;
  readonly references: ReadonlyArray<Reference>;
  readonly insuranceCoverage: InsuranceCoverage | null;
  readonly scheduleBTables: ScheduleBTables | null;
  readonly tvcc: TvccCompliance | null;
  readonly documentsToDemand: ReadonlyArray<string>;
  readonly isWorksCase: boolean;
}

/** Extra context for a rule (work type gates which rules apply). */
export interface RuleContext {
  workType?: string | null;
  jobNumber?: string | null;
}

/** A single engineering-compliance dimension. Most dimensions are generic
 *  projections keyed by artifact area/category/reference/keyword; a few
 *  (insurance, BOQ, TVCC) override `evaluate` to read a structured sub-artifact. */
export interface ComplianceRule {
  key: string;
  label: string;
  category: string;
  ruleRef: string;
  ruleVersion: string;
  /** Return false to mark the dimension not-applicable for this work type. */
  appliesTo: (ctx: RuleContext) => boolean;
  requiredDocs: string[];
  evidenceSources: string[];
  crossChecks: string[];
  riskIndicators: string[];
  recommendedActions: string[];
  evaluate: (input: ComplianceInput, ctx: RuleContext) => ComplianceFinding;
}

/** Narrow a full CaseIntelligence artifact to the read-only compliance input. */
export function toComplianceInput(intel: CaseIntelligence): ComplianceInput {
  return {
    compliance: intel.compliance,
    findings: intel.findings,
    correlations: intel.correlations,
    references: intel.references,
    insuranceCoverage: intel.insuranceCoverage,
    scheduleBTables: intel.scheduleBTables,
    tvcc: intel.tvcc,
    documentsToDemand: intel.synthesis?.documentsToDemand ?? [],
    isWorksCase: Boolean(intel.meta?.jobNumber),
  };
}
