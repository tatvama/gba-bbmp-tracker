import { STATUTE_MAP } from "@/lib/letters/letter-knowledge";
import type { BillFinding } from "@/lib/forensics/types";
import type { RawCaseMaterial } from "./ingest";
import type { Store } from "../builder";
import type { Observation, TimelineEvent, ComplianceItem, FinancialSummary, Confidence } from "../types";

/**
 * Stage 4 — Investigate (deterministic). Reuses the persisted output of the
 * forensic engine: job_audits.report findings (incl. imported SKILL-G-*) and
 * bill_audits findings are normalized into evidence-linked Observations; loss
 * lines, chronology, compliance and risk are assembled. No LLM, no re-computation
 * of numbers the deterministic engine already produced.
 */

export interface AnalyzeResult {
  findings: Observation[];
  financials: FinancialSummary;
  timeline: TimelineEvent[];
  compliance: ComplianceItem[];
  riskAssessment: { band: string | null; score: number | null; byCategory?: Record<string, number>; evidenceGradeSummary?: Record<string, number> };
}

const AREA_BY_CATEGORY: Record<string, string> = {
  ARITHMETIC: "Financial arithmetic (PWD Code / KW-4)",
  DEDUCTION: "Statutory deductions (KW-4 / GST-TDS / BOCW)",
  QUANTITY: "Quantity variation (PWD Code ≤125%)",
  RATE: "Rate (KPWD Schedule of Rates / KTPP)",
  CHRONOLOGY: "Sanction sequence (KW-4 / KTPP)",
  ELIGIBILITY: "Tender eligibility (KTPP)",
  INSURANCE: "Insurance / security (KW-4)",
  ROYALTY: "Royalty / mineral dispatch (Mineral Concession Rules)",
  MB_INTEGRITY: "Measurement Book integrity",
  FORM_INTEGRITY: "Document form integrity",
  PHOTO: "Site / geo-tag evidence",
  PATTERN: "Cross-document consistency",
  LOSS: "Financial exposure",
};

/** Category → English statutory basis, so every finding contributes a clean
 *  English instrument to the Legal Framework even when its own ruleRef is Kannada
 *  or when the code prefix (e.g. SKILL-G-*) isn't in STATUTE_MAP. */
const CATEGORY_STATUTE: Record<string, string> = {
  ARITHMETIC: "PWD Code & KW-4 agreement payment clauses",
  DEDUCTION: "KW-4 agreement & statutory deduction rules (IT-TDS, GST-TDS, BOCW cess)",
  QUANTITY: "KTPP Act 1999 & PWD Code quantity-variation limit (≤125% per item)",
  RATE: "KPWD Schedule of Rates & KTPP Act 1999",
  CHRONOLOGY: "KTPP Act 1999 & Rules 2000; KW-4 timeline clauses",
  ELIGIBILITY: "KTPP Act 1999 & contractor-registration (KW) rules",
  INSURANCE: "KW-4 agreement insurance & performance-security clauses",
  ROYALTY: "Karnataka Minor Mineral Concession Rules (royalty / mineral dispatch)",
  MB_INTEGRITY: "KPWD MB-book maintenance & test-check rules",
  FORM_INTEGRITY: "KTPP Act 1999 & Rules 2000; BBMP works rules & document-integrity norms",
  PHOTO: "IT Act 2000 s.65B (electronic records) & geo-tag portal-log norms",
  PATTERN: "KTPP Act 1999 (tender transparency & document consistency)",
  LOSS: "Recovery provisions under KW-4 & PWD Code",
  CORRELATION: "KTPP Act 1999 (cross-document consistency)",
};

/** Rule references for a finding: its own (often Kannada) law text PLUS a clean
 *  English statutory basis (STATUTE_MAP by code prefix, else by category). */
function resolveRuleRefs(f: BillFinding, category: string): string[] {
  const refs: string[] = [];
  const code = (f.code ?? "").toUpperCase();
  const prefixKey = Object.keys(STATUTE_MAP).find((k) => code.startsWith(k));
  if (prefixKey) refs.push(STATUTE_MAP[prefixKey]!);
  else if (CATEGORY_STATUTE[category]) refs.push(CATEGORY_STATUTE[category]!);
  if (f.ruleRef && !refs.includes(f.ruleRef)) refs.push(f.ruleRef);
  return refs;
}

function gradeToConfidence(grade?: string): Confidence {
  if (grade === "A" || grade === "B") return "High";
  if (grade === "C" || grade === "D") return "Medium";
  return grade === "E" ? "Low" : "Medium";
}

export function analyzeCase(material: RawCaseMaterial, store: Store): AnalyzeResult {
  const { jobAudit, jobCase, billAudits, runningBills, timeline: cTimeline, jobTimelineDates } = material;
  const report = (jobAudit?.report ?? null) as any;
  const forensicSkill = (report?.forensicSkill ?? null) as Record<string, any> | null;

  const findings: Observation[] = [];
  const normalize = (
    f: BillFinding,
    grounding: { sourceTable: "job_audits" | "complaint_documents"; sourceDocId: string | null; docType: string },
  ): Observation => {
    const evId = store.addEvidence({
      sourceTable: grounding.sourceTable,
      sourceDocId: grounding.sourceDocId,
      docType: grounding.docType,
      page: null,
      extract: f.workedExample || f.detail || f.title,
      confidence: gradeToConfidence(f.evidenceGrade),
    });
    const category = f.category ?? "ARITHMETIC";
    return {
      id: store.obsId(),
      code: f.code,
      statement: f.detail || f.title,
      category,
      severity: f.severity,
      findingClass: f.findingClass,
      evidenceGrade: f.evidenceGrade,
      confidence: gradeToConfidence(f.evidenceGrade),
      evidenceIds: [evId],
      ruleRefs: resolveRuleRefs(f, category),
      officerRefs: [],
      relatedTimelineIds: [],
      relatedDocumentIds: f.sourceDocId ? [f.sourceDocId] : [],
      recordToDemand: f.recordToDemand,
      workedExample: f.workedExample,
      lossExposure: f.lossExposure,
    };
  };

  // Forensic job-audit findings (includes imported SKILL-G-*).
  const reportFindings: BillFinding[] = (report?.rankedFindings ?? report?.findings ?? []) as BillFinding[];
  for (const f of reportFindings) {
    findings.push(normalize(f, { sourceTable: "job_audits", sourceDocId: f.sourceDocId ?? jobAudit?.id ?? null, docType: "Forensic audit finding" }));
  }
  // Per-document bill-audit findings.
  for (const ba of billAudits ?? []) {
    for (const f of (ba.findings ?? []) as BillFinding[]) {
      findings.push(normalize(f, { sourceTable: "complaint_documents", sourceDocId: (ba.document_id as string) ?? null, docType: "Bill audit finding" }));
    }
  }

  // ── Financials ──────────────────────────────────────────────────────────
  const lossLines = ((report?.loss?.lines ?? []) as any[]).map((l) => ({
    type: l.type ?? "", label: l.label ?? "", exposure: Number(l.exposure) || 0, formula: l.formula, caveat: l.caveat ?? "possible exposure requiring verification",
  }));
  const financials: FinancialSummary = {
    sanctionedAmount: null,
    grossAmount: jobCase?.gross_amount != null ? Number(jobCase.gross_amount) : null,
    netAmount: jobCase?.net_amount != null ? Number(jobCase.net_amount) : null,
    deduction: jobCase?.deduction != null ? Number(jobCase.deduction) : null,
    treasuryLossTotal: forensicSkill?.treasuryLossTotal ?? (jobAudit?.total_exposure != null ? String(jobAudit.total_exposure) : null),
    lossLines,
    runningBills: (runningBills ?? []).map((r) => ({ billNo: r.bill_no ?? null, billDate: r.bill_date ?? null, thisBill: r.this_bill != null ? Number(r.this_bill) : null, totalUptoDate: r.total_upto_date != null ? Number(r.total_upto_date) : null })),
  };

  // ── Timeline (job dates + complaint timeline + dataset chronology) ─────────
  const timeline: TimelineEvent[] = [];
  for (const t of jobTimelineDates ?? []) {
    if (!t.event && !t.event_date) continue;
    const evId = store.addEvidence({ sourceTable: "job_audits", sourceDocId: jobAudit?.id ?? null, docType: "Timeline date", page: null, extract: `${t.event ?? ""}: ${t.event_date ?? t.raw ?? ""}`, confidence: "Medium" });
    timeline.push({ id: store.tlId(), date: t.event_date ?? null, event: t.event ?? (t.raw ?? "event"), source: "job_timeline_dates", evidenceIds: [evId] });
  }
  for (const e of cTimeline ?? []) {
    const evId = store.addEvidence({ sourceTable: "complaint_timeline", sourceDocId: e.id ?? null, docType: e.event_type ?? null, page: null, extract: `${e.title ?? ""}${e.summary ? `: ${e.summary}` : ""}`, confidence: "High" });
    timeline.push({ id: store.tlId(), date: e.event_date ?? null, event: `${e.event_type ? `[${e.event_type}] ` : ""}${e.title ?? ""}`, source: "complaint_timeline", evidenceIds: [evId] });
  }
  const dsChron = (report && forensicSkill) ? [] : []; // dataset chronology already captured via job_timeline_dates on import
  void dsChron;
  timeline.sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));

  // ── Compliance (derived from finding categories + records to demand) ──────
  const compliance: ComplianceItem[] = [];
  const byCat = new Map<string, Observation[]>();
  for (const f of findings) {
    const arr = byCat.get(f.category) ?? byCat.set(f.category, []).get(f.category)!;
    arr.push(f);
  }
  for (const [cat, obs] of byCat) {
    const demands = [...new Set(obs.map((o) => o.recordToDemand).filter(Boolean) as string[])];
    compliance.push({
      area: AREA_BY_CATEGORY[cat] ?? cat,
      requirement: `Documented compliance for ${obs.length} ${cat} finding(s)`,
      status: "discrepancy",
      detail: obs.slice(0, 3).map((o) => o.code ?? o.statement.slice(0, 60)).join("; "),
      recordToDemand: demands.slice(0, 4).join("; ") || undefined,
      ruleRef: obs[0]?.ruleRefs[0],
      evidenceIds: obs.flatMap((o) => o.evidenceIds).slice(0, 3),
    });
  }
  // Documents demanded by the skill (records not produced).
  for (const d of (forensicSkill?.documentsDemanded ?? []) as string[]) {
    const evId = store.addEvidence({ sourceTable: "job_audits", sourceDocId: jobAudit?.id ?? null, docType: "Documents demanded", page: null, extract: d, confidence: "High" });
    compliance.push({ area: "Records to be produced", requirement: d, status: "not_shown", recordToDemand: d, evidenceIds: [evId] });
  }

  // ── Risk ──────────────────────────────────────────────────────────────────
  const evidenceGradeSummary: Record<string, number> = {};
  for (const f of findings) if (f.evidenceGrade) evidenceGradeSummary[f.evidenceGrade] = (evidenceGradeSummary[f.evidenceGrade] ?? 0) + 1;
  const riskAssessment = {
    band: (jobAudit?.risk_band as string) ?? report?.risk?.band ?? null,
    score: (jobAudit?.risk_score as number) ?? report?.risk?.score ?? null,
    byCategory: report?.risk?.byCategory,
    evidenceGradeSummary,
  };

  return { findings, financials, timeline, compliance, riskAssessment };
}
