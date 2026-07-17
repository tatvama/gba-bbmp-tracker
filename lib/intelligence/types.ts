/**
 * Case Intelligence Engine — shared, framework-free types (no `server-only`; the
 * artifact shape is imported by client components too).
 *
 * The engine investigates a complaint's complete document set and emits ONE
 * versioned, evidence-linked `CaseIntelligence` artifact. Every Observation must
 * carry ≥1 evidence id (the "evidence rule"); the verify stage enforces it. The
 * `graph` is a DERIVED projection over the artifact (nodes/edges), built in one
 * place (lib/intelligence/graph.ts) so stages stay focused on their data.
 */

/** Bump to force a full rebuild of every cached artifact.
 *  cie-2: legal framework now also carries English statutory basis per category.
 *  cie-3: review fixes (correlate identity fields, gstin/pan validation, graph
 *  integrity, AI-degradation cache invalidation, deterministic doc ordering).
 *  cie-4: ingest no longer triggers document analysis itself (removed the
 *  @napi-rs/canvas-reaching import that broke instrumentation.ts's bundle).
 *  cie-5: unconditional document-fact extraction (AA/TS/KW-4/tender/MDP/royalty/
 *  insurance) — surfaced whether or not anything is flagged, not just on findings.
 *  cie-6: document-fact schema widened to full per-category detail (authority,
 *  validity, contractor, completion period, quarry source, etc.) + per-document
 *  caching (mig 0041) so only new/changed documents are re-extracted.
 *  cie-7: deterministic KW-4 Clause 13 insurance-coverage table (Type of Cover /
 *  Minimum Cover Required Under KW-4 / Status) added to the artifact so letters
 *  reproduce it verbatim as a table (never AI-invented).
 *  cie-8: Schedule-B quantity tables (excavation / dismantling-milling line items
 *  transcribed from documents; Item/Description/Qty/Unit/Rate/Amount + group
 *  totals) added to the artifact for the same verbatim-table reproduction. */
export const ENGINE_VERSION = "cie-8";

export type Confidence = "High" | "Medium" | "Low";

/** A grounding record: the verbatim source behind an observation/entity. */
export interface Evidence {
  id: string; // ev_<n>
  sourceTable:
    | "complaint_documents"
    | "job_documents"
    | "job_audits"
    | "complaint_replies"
    | "complaint_action_taken"
    | "complaint_timeline"
    | "letter_drafts"
    | "job_cases"
    | "complaint"
    | "derived";
  sourceDocId: string | null;
  docType: string | null;
  page: number | null;
  extract: string; // bounded verbatim snippet
  confidence: Confidence;
}

// ── Knowledge graph (derived projection) ─────────────────────────────────────
export type NodeType =
  | "Document" | "Evidence" | "Officer" | "Department" | "Contractor"
  | "GovernmentOrder" | "TenderPackage" | "Bidder" | "WorkOrder" | "Agreement"
  | "RunningBill" | "MeasurementBook" | "Royalty" | "MDP" | "TimelineEvent"
  | "Rule" | "Finding" | "Observation" | "ComplianceItem" | "Project";

export type EdgeType =
  | "supported_by" | "signed_by" | "approved_by" | "responsible_for"
  | "issued_under" | "awarded_to" | "measured_in" | "billed_in"
  | "governed_by" | "cites_rule" | "contradicts" | "precedes"
  | "derived_from" | "relates_to";

export interface GraphNode {
  id: string; // <type>_<n>
  type: NodeType;
  label: string;
  data?: Record<string, unknown>;
}
export interface GraphEdge {
  from: string;
  to: string;
  type: EdgeType;
  label?: string;
}
export interface CaseGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** A single evidence-linked investigative statement (normalized BillFinding or new). */
export interface Observation {
  id: string; // obs_<n>
  code?: string; // carried verbatim (SKILL-G-1, PT-X01, RY-01, …)
  statement: string;
  category: string; // CheckCategory | "GO" | "TENDER" | "MDP" | "OFFICER" | "CORRELATION"
  severity: "High" | "Medium" | "Low";
  findingClass?: string;
  evidenceGrade?: string;
  confidence: Confidence;
  evidenceIds: string[];
  ruleRefs: string[];
  officerRefs: string[];
  relatedTimelineIds: string[];
  relatedDocumentIds: string[];
  recordToDemand?: string;
  workedExample?: string;
  lossExposure?: number;
}

export interface TimelineEvent {
  id: string; // tl_<n>
  date: string | null;
  event: string;
  source?: string;
  evidenceIds: string[];
}

export interface Reference {
  label: string; // "Government Order" | "Tender" | "Work Order" | "File" | "Bill" | "Agreement" | "Job Number"
  value: string;
  date?: string | null;
  evidenceIds: string[];
}

export interface OfficerRef {
  id: string; // off_<n>
  name: string;
  designation?: string | null;
  office?: string | null;
  contactId?: string | null; // resolved to contacts.id when possible
  roles: string[]; // "responsible" | "signed" | "approved" | "named"
  evidenceIds: string[];
}

export interface ComplianceItem {
  area: string; // AA | TS | Tender/KTPP | KW-4 | MB | Royalty | MDP | Labour | Environment | Insurance | Eligibility | Other
  requirement: string;
  status: "met" | "not_shown" | "discrepancy" | "unknown";
  detail?: string;
  recordToDemand?: string;
  ruleRef?: string;
  evidenceIds: string[];
}

export interface LegalRef {
  instrument: string; // e.g. "KTPP Act 1999 & Rules 2000"
  provision?: string;
  relevance: string;
  ruleRefKeys: string[]; // finding-code prefixes this maps from
}

/** One row of the KW-4 Clause 13 insurance-coverage compliance table. The cover
 *  types and the minimum-cover requirements are FIXED by the KW-4 standard
 *  contract; only the "Works, Plant and Materials" minimum (agreement value +
 *  20%) and the per-row Status are case-specific. */
export interface InsuranceCoverRow {
  coverType: string; // e.g. "Works, Plant and Materials"
  minimumRequired: string; // e.g. "Agreement value plus 20% (approximately Rs. …)"
  status: string; // "Not on record" | "On record (Policy No. …)"
}

/** The full deterministic insurance-compliance table (mandatory KW-4 Clause 13
 *  covers, their minimum requirement, and whether each is evidenced) that a
 *  Lokayukta complaint / legal notice / counter-reply reproduces verbatim. Built
 *  in the engine (lib/intelligence/insurance-coverage.ts), NOT by the drafter —
 *  the figures and cover types must never be AI-invented. */
export interface InsuranceCoverage {
  rows: InsuranceCoverRow[];
  agreementValue?: string | null; // the agreement/contract value the +20% is computed on, if known
  policiesFound: number;
  ruleRef: string; // e.g. "KW-4 Section 4 (GCC) Clause 13 (Insurance)"
  note?: string; // narrative to accompany the table (Clause 13.2/13.3 obligations, policies found)
}

/** One Schedule-B / BOQ line item, as transcribed from the case documents. Every
 *  figure is the value as printed (verbatim), so a letter cites the real
 *  Schedule-B numbers; the amount is computed (qty × rate) only when not printed. */
export interface ScheduleBRow {
  item: string; // "Item 2" / "2" (as printed), or "-" if not shown
  description: string;
  qty: string; // sanctioned/Schedule-B quantity as printed
  unit: string; // "Cum" / "Sqm" / "Mtr", or "-" if not shown
  rate: string; // rate per unit as printed
  amount: string; // amount at schedule rate (printed, else computed qty × rate)
}

/** A category grouping of Schedule-B rows (excavation, or dismantling/milling)
 *  with its per-group total, mirroring the reference Lokayukta complaint's two
 *  Schedule-B tables. `totalQty` is filled only when every row shares one unit. */
export interface ScheduleBGroup {
  category: "excavation" | "dismantling_milling";
  title: string; // display heading, e.g. "Excavation (earthwork)"
  totalLabel: string; // e.g. "TOTAL EXCAVATION SANCTIONED"
  rows: ScheduleBRow[];
  totalQty?: string | null; // summed quantity when the group has a single unit, else null
  totalUnit?: string | null; // the shared unit, when totalQty is present
  totalAmount: string; // summed amount at schedule rate, grouped (no "Rs." prefix)
}

/** Deterministic Schedule-B quantity tables (earthwork-excavation and
 *  dismantling/milling line items) built by lib/intelligence/schedule-b-tables.ts
 *  from figures transcribed out of the case documents. Null when no such line
 *  items were found. The drafter reproduces these verbatim as tables. */
export interface ScheduleBTables {
  groups: ScheduleBGroup[];
  note?: string; // "transcribed; verify against the certified Schedule-B / MB"
}

export interface FinancialSummary {
  sanctionedAmount?: number | null;
  grossAmount?: number | null;
  netAmount?: number | null;
  deduction?: number | null;
  treasuryLossTotal?: string | null;
  lossLines: { type: string; label: string; exposure: number; formula?: string; caveat: string }[];
  runningBills: { billNo?: string | null; billDate?: string | null; thisBill?: number | null; totalUptoDate?: number | null }[];
}

export interface Synthesis {
  situation: string;
  prioritizedSuspicions: { title: string; detail: string; observationIds: string[] }[];
  outstandingIssues: { issue: string; status?: string }[];
  contradictions: { summary: string; observationIds: string[] }[];
  documentsToDemand: string[];
  specificRequests: string[];
  reliefs: string[];
  futureCourse: string[];
  confidenceScore: number; // 0-100
}

export interface VerificationReport {
  passed: boolean;
  groundedCount: number;
  ungroundedClaims: string[];
  numericMismatches: string[];
  notes: string[];
}

export interface CaseIntelligenceMeta {
  complaintId: string;
  jobNumber: string | null;
  source: "forensic_import" | "manual" | "mixed";
  engineVersion: string;
  promptVersions: Record<string, string>;
  builtAt: string;
  contextHash: string;
  aiConfigured: boolean;
  coverage: { documentsTotal: number; documentsAnalyzed: number; capped: boolean };
}

export interface CaseIntelligence {
  meta: CaseIntelligenceMeta;
  graph: CaseGraph;
  evidence: Evidence[];
  parties: {
    contractor: {
      name: string | null;
      class?: string | null;
      gstin?: string | null;
      pan?: string | null;
      agreementNo?: string | null;
      evidenceIds: string[];
    };
    officers: OfficerRef[];
    recipients: { designation: string; name?: string | null; office?: string | null }[];
  };
  references: Reference[];
  project: {
    workDescription: string | null;
    ward?: string | null;
    division?: string | null;
    subDivision?: string | null;
    zone?: string | null;
  };
  timeline: TimelineEvent[];
  financials: FinancialSummary;
  findings: Observation[];
  correlations: Observation[];
  compliance: ComplianceItem[];
  /** Deterministic KW-4 Clause 13 insurance table; null when the case is not a
   *  works contract (no job number / agreement / insurance policy on record). */
  insuranceCoverage: InsuranceCoverage | null;
  /** Deterministic Schedule-B quantity tables (excavation, dismantling/milling)
   *  transcribed from the case documents; null when no such line items found. */
  scheduleBTables: ScheduleBTables | null;
  legalFramework: LegalRef[];
  synthesis: Synthesis;
  verification: VerificationReport;
  riskAssessment: {
    band: string | null;
    score: number | null;
    byCategory?: Record<string, number>;
    evidenceGradeSummary?: Record<string, number>;
  };
}

/** Result wrapper from the engine entry point. */
export interface BuildCaseIntelligenceResult {
  ok: boolean;
  intel: CaseIntelligence | null;
  fromCache: boolean;
  error?: string;
}
