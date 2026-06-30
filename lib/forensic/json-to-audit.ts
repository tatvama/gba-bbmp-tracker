/**
 * PURE mapping of the forensic skill's minimum-dataset JSON onto the app's
 * existing forensic data model — WITHOUT re-running the audit engine. The skill
 * has already done the (adversarially-verified) analysis; we ingest its result:
 *   • build a JobAuditReport (the shape the dossier renders + buildCaseHistory
 *     reads as report.rankedFindings) directly from loss_components / risk colour,
 *   • build side-table rows (running bills, timeline) for the dossier tables,
 *   • build a job_cases patch (description / contractor / amounts / division).
 * No runJobAudit, no SR rates.
 */
import { parseAmount } from "@/lib/ifms/downloader";
import { scoreFinding } from "@/lib/forensics/risk-score";
import type { BillFinding, Severity } from "@/lib/forensics/types";
import type { JobAuditReport, DocumentMatrixRow } from "@/lib/forensics/job-audit";
import type { JobRisk } from "@/lib/forensics/risk-score";
import { mapRiskColourToBand } from "./parse-skill-output";
import type { ForensicDataset, ForensicRiskColour } from "./skill-output";

/** JobAuditReport + the skill's verbatim headline (stored in job_audits.report). */
export type ForensicJobAuditReport = JobAuditReport & {
  forensicSkill?: {
    summary?: string;
    caveats?: string;
    misleadingSummary?: string[];
    treasuryLossTotal?: string;
    overallRisk?: ForensicRiskColour;
    lossLine?: string;
  };
};

const SCORE_BY_COLOUR: Record<ForensicRiskColour, number> = {
  Green: 5,
  Amber: 30,
  Orange: 55,
  Red: 80,
  Purple: 95,
};

function sevFromConfidence(c?: string): Severity {
  if (c === "high") return "High";
  if (c === "low") return "Low";
  return "Medium";
}

/** Try to coerce a loose date ("12-04-2025", "2025-04-12", "12 Apr 2025") to ISO yyyy-mm-dd, else null. */
function toIsoDate(s: string | undefined | null): string | null {
  if (!s) return null;
  const t = s.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(t); // dd-mm-yyyy
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  const d = Date.parse(t);
  if (!Number.isNaN(d)) return new Date(d).toISOString().slice(0, 10);
  return null;
}

function misleadingArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v.filter(Boolean) : [v];
}

/** Build the JobAuditReport directly from the skill dataset (no engine run). */
export function datasetToAuditReport(jobNumber: string, d: ForensicDataset): ForensicJobAuditReport {
  const findings: BillFinding[] = [];

  (d.loss_components ?? []).forEach((lc, i) => {
    const f: BillFinding = {
      code: `SKILL-LOSS-${i + 1}`,
      title: lc.category || "Possible financial exposure",
      severity: sevFromConfidence(lc.confidence),
      detail: [lc.formula, lc.inputs].filter(Boolean).join(" — ") || "Possible exposure requiring verification.",
      category: "LOSS",
      findingClass: "calc_variance",
      evidenceStrength: lc.confidence === "high" ? "strong" : lc.confidence === "low" ? "weak" : "moderate",
      lossExposure: typeof lc.amount === "number" ? lc.amount : undefined,
      recordToDemand: lc.record,
      safeText:
        "Possible financial exposure requiring verification against original records (not a proven loss).",
    };
    f.riskPoints = scoreFinding(f);
    findings.push(f);
  });

  misleadingArray(d.misleading_summary).forEach((point, i) => {
    const f: BillFinding = {
      code: `SKILL-MIS-${i + 1}`,
      title: "Possible misrepresentation / concealment",
      severity: "Medium",
      detail: point,
      category: "FORM_INTEGRITY",
      findingClass: "confirmed_mismatch",
      evidenceStrength: "moderate",
      safeText: "Documented suspicion requiring production of originals and explanation.",
    };
    f.riskPoints = scoreFinding(f);
    findings.push(f);
  });

  const byCategory: Record<string, number> = {};
  for (const f of findings) {
    const k = f.category ?? "ARITHMETIC";
    byCategory[k] = (byCategory[k] ?? 0) + (f.riskPoints ?? 0);
  }

  const colour = d.overall_risk;
  const band = mapRiskColourToBand(colour);
  const score = colour ? SCORE_BY_COLOUR[colour] : findings.length ? 30 : 0;
  const risk: JobRisk = { score, band, byCategory };

  const lossLines = (d.loss_components ?? [])
    .filter((lc) => typeof lc.amount === "number")
    .map((lc) => ({
      type: "LOSS",
      label: lc.category || "Possible exposure",
      exposure: lc.amount as number,
      formula: lc.formula || "",
      caveat: "Possible exposure requiring verification (not a proven loss).",
    }));
  const totalFromTotal = parseAmount(d.treasury_loss_total);
  const totalPossibleExposure =
    totalFromTotal ?? Math.round(lossLines.reduce((s, l) => s + l.exposure, 0) * 100) / 100;

  const documentMatrix: DocumentMatrixRow[] = Object.entries(d.document_presence ?? {}).map(([k, v]) => ({
    docType: k,
    present: /present|filled|yes|ok/i.test(String(v)) && !/missing|blank|absent|image.?only/i.test(String(v)),
    date: null,
    source: String(v),
  }));

  const rankedFindings = [...findings].sort((a, b) => (b.riskPoints ?? 0) - (a.riskPoints ?? 0));

  return {
    jobNumber,
    documentMatrix,
    findings,
    rankedFindings,
    risk,
    loss: { lines: lossLines, totalPossibleExposure },
    counts: { findings: findings.length, redFlags: findings.filter((f) => f.severity !== "Low").length },
    forensicSkill: {
      summary: d.summary,
      caveats: d.caveats,
      misleadingSummary: misleadingArray(d.misleading_summary),
      treasuryLossTotal: d.treasury_loss_total,
      overallRisk: colour,
      lossLine: d.loss_line,
    },
  };
}

/** Columns for a job_audits row, derived from the report. */
export function auditRowFromReport(report: ForensicJobAuditReport) {
  return {
    report,
    risk_score: report.risk.score,
    risk_band: report.risk.band,
    total_exposure: report.loss.totalPossibleExposure,
    finding_count: report.counts.findings,
    red_flag_count: report.counts.redFlags,
    doc_count: report.documentMatrix.length,
  };
}

/** job_running_bills rows from payment_rows (document_id left null — these are job docs). */
export function datasetToRunningBillRows(jobNumber: string, d: ForensicDataset) {
  return (d.payment_rows ?? []).map((p) => ({
    job_number: jobNumber,
    document_id: null as string | null,
    bill_no: p.bill ?? null,
    bill_date: toIsoDate(p.date),
    item_code: null as string | null,
    previous_measurement: null as number | null,
    this_bill: parseAmount(p.net) ?? parseAmount(p.gross),
    total_upto_date: parseAmount(p.cum),
  }));
}

/** job_timeline_dates rows from chronology + key sanction/WO/agreement dates. */
export function datasetToTimelineRows(jobNumber: string, d: ForensicDataset) {
  const rows: { job_number: string; document_id: string | null; event: string; event_date: string | null; raw: string | null; confidence: string | null }[] = [];
  const push = (event: string, raw?: string) => {
    if (!raw) return;
    rows.push({ job_number: jobNumber, document_id: null, event, event_date: toIsoDate(raw), raw, confidence: null });
  };
  (d.chronology ?? []).forEach((c) => push(c.event || "Event", c.date));
  push("Administrative sanction", d.administrative_sanction?.date);
  push("Technical sanction", d.technical_sanction?.date);
  push("Agreement", d.agreement?.date);
  push("Work order", d.work_order?.date);
  return rows;
}

function sumAmounts(values: (string | undefined)[]): number | null {
  const nums = values.map((v) => parseAmount(v)).filter((n): n is number => n != null);
  if (!nums.length) return null;
  return Math.round(nums.reduce((s, n) => s + n, 0) * 100) / 100;
}

/** Patch for the job_cases row (only non-null fields should be applied on upsert). */
export function datasetToJobCasePatch(d: ForensicDataset) {
  const payments = d.payment_rows ?? [];
  const lastCum = payments.length ? parseAmount(payments[payments.length - 1]!.cum) : null;
  return {
    description: d.work ?? null,
    contractor: d.contractor?.name ?? null,
    gross_amount: sumAmounts(payments.map((p) => p.gross)),
    deduction: sumAmounts(payments.map((p) => p.deduct)),
    net_amount: lastCum ?? sumAmounts(payments.map((p) => p.net)),
    bill_ids: d.bill_ids ?? null,
    wo_ref: d.work_order?.number ?? null,
    zone: d.zone ?? null,
    division: d.division ?? null,
    sub_division: d.sub_division ?? null,
  };
}
