/**
 * PURE mapping of the forensic skill's rich data/<code>.json onto the app's
 * forensic model — WITHOUT re-running the audit engine. The skill already did the
 * analysis; we ingest it: grounds → rankedFindings, overall_risk → band, the rest
 * into job_audits.report (so the dossier + AI counter-reply read them).
 */
import { parseAmount } from "@/lib/ifms/downloader";
import { scoreFinding } from "@/lib/forensics/risk-score";
import type { BillFinding, Severity } from "@/lib/forensics/types";
import type { JobAuditReport, DocumentMatrixRow } from "@/lib/forensics/job-audit";
import type { JobRisk } from "@/lib/forensics/risk-score";
import { mapRiskColourToBand, parseRiskColour } from "./parse-skill-output";
import type { ForensicDataset, ForensicRiskColour } from "./skill-output";

export type ForensicJobAuditReport = JobAuditReport & {
  forensicSkill?: {
    summary?: string;
    caveats?: string;
    misleadingSummary?: string[];
    treasuryLossTotal?: string;
    overallRisk?: string;
    lossLine?: string;
    documentsDemanded?: string[];
    contractor?: string;
    division?: string;
    subDivision?: string;
    wards?: string;
  };
};

const SCORE_BY_COLOUR: Record<ForensicRiskColour, number> = { Green: 5, Amber: 30, Orange: 55, Red: 80, Purple: 95 };

function groundSeverity(risk: string | undefined): Severity {
  const c = parseRiskColour(risk);
  if (c === "Red" || c === "Purple") return "High";
  if (c === "Green") return "Low";
  return "Medium"; // Orange / Amber / unknown
}

function toIsoDate(s: string | undefined | null): string | null {
  if (!s) return null;
  const t = s.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(t); // dd-mm-yyyy | dd.mm.yyyy | dd/mm/yyyy
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  const d = Date.parse(t);
  return Number.isNaN(d) ? null : new Date(d).toISOString().slice(0, 10);
}

export function contractorName(c: ForensicDataset["contractor"]): string | null {
  if (!c) return null;
  if (typeof c === "string") return c.trim().slice(0, 300) || null;
  return c.name?.trim() || null;
}

function misleadingArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return (Array.isArray(v) ? v : [v]).filter(Boolean);
}

function demandsArray(v: ForensicDataset["documents_demanded"]): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x : x?.demand || x?.label || "")).filter(Boolean) as string[];
}

/** Build the JobAuditReport directly from the skill dataset (no engine run). */
export function datasetToAuditReport(jobNumber: string, d: ForensicDataset): ForensicJobAuditReport {
  const findings: BillFinding[] = [];

  (d.grounds ?? []).forEach((g, i) => {
    const f: BillFinding = {
      code: `SKILL-G-${i + 1}`,
      title: g.title || "Documented suspicion",
      severity: groundSeverity(g.risk),
      detail: [g.mismatch, g.observed, g.reason].filter(Boolean).join(" — ") || "Requires production of records.",
      category: "FORM_INTEGRITY",
      findingClass: "missing_proof",
      evidenceStrength: g.evidence ? "documentary" : "moderate",
      recordToDemand: g.demand,
      ruleRef: g.law,
      safeText: "Documented suspicion requiring production of originals and explanation (not a proven offence).",
      workedExample: g.example,
    };
    f.riskPoints = scoreFinding(f);
    findings.push(f);
  });

  // Legacy minimum-dataset fallback (loss_components) when there are no grounds.
  if (findings.length === 0) {
    (d.loss_components ?? []).forEach((lc, i) => {
      const f: BillFinding = {
        code: `SKILL-LOSS-${i + 1}`,
        title: lc.category || "Possible financial exposure",
        severity: lc.confidence === "high" ? "High" : lc.confidence === "low" ? "Low" : "Medium",
        detail: [lc.formula, lc.inputs].filter(Boolean).join(" — ") || "Possible exposure requiring verification.",
        category: "LOSS",
        findingClass: "calc_variance",
        lossExposure: typeof lc.amount === "number" ? lc.amount : undefined,
        recordToDemand: lc.record,
        safeText: "Possible financial exposure requiring verification (not a proven loss).",
      };
      f.riskPoints = scoreFinding(f);
      findings.push(f);
    });
  }

  const byCategory: Record<string, number> = {};
  for (const f of findings) {
    const k = f.category ?? "FORM_INTEGRITY";
    byCategory[k] = (byCategory[k] ?? 0) + (f.riskPoints ?? 0);
  }

  const colour = parseRiskColour(d.overall_risk);
  const band = mapRiskColourToBand(colour);
  const score = colour ? SCORE_BY_COLOUR[colour] : findings.length ? 40 : 0;
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
  const totalPossibleExposure =
    parseAmount(d.treasury_loss_total) ?? Math.round(lossLines.reduce((s, l) => s + l.exposure, 0) * 100) / 100;

  const documentMatrix: DocumentMatrixRow[] = Object.entries(d.document_presence ?? {}).map(([k, v]) => {
    const present =
      v && typeof v === "object"
        ? Boolean((v as { present?: unknown }).present)
        : /present|filled|yes|ok/i.test(String(v)) && !/missing|blank|absent|image.?only/i.test(String(v));
    return { docType: k, present, date: null, source: typeof v === "object" ? JSON.stringify(v) : String(v) };
  });

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
      overallRisk: d.overall_risk,
      lossLine: d.loss_line,
      documentsDemanded: demandsArray(d.documents_demanded),
      contractor: contractorName(d.contractor) ?? undefined,
      division: d.division,
      subDivision: d.sub_division,
      wards: d.wards,
    },
  };
}

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

/** job_running_bills rows from payment_rows (real {item,amount,source} or legacy keys). */
export function datasetToRunningBillRows(jobNumber: string, d: ForensicDataset) {
  return (d.payment_rows ?? []).map((p) => ({
    job_number: jobNumber,
    document_id: null as string | null,
    bill_no: (p.bill ?? p.item ?? null)?.toString().slice(0, 200) ?? null,
    bill_date: toIsoDate(p.date),
    item_code: null as string | null,
    previous_measurement: null as number | null,
    this_bill: parseAmount(p.amount) ?? parseAmount(p.net) ?? parseAmount(p.gross),
    total_upto_date: parseAmount(p.cum),
  }));
}

/** job_timeline_dates rows from chronology. */
export function datasetToTimelineRows(jobNumber: string, d: ForensicDataset) {
  return (d.chronology ?? [])
    .filter((c) => c && (c.event || c.date))
    .map((c) => ({
      job_number: jobNumber,
      document_id: null as string | null,
      event: (c.event || "Event").toString().slice(0, 300),
      event_date: toIsoDate(c.date),
      raw: c.date ?? null,
      confidence: null as string | null,
    }));
}

/** Patch for the job_cases row (only non-null fields applied on upsert). */
export function datasetToJobCasePatch(d: ForensicDataset) {
  const legacyNet = (d.payment_rows ?? []).map((p) => parseAmount(p.net)).filter((n): n is number => n != null);
  return {
    description: d.work ?? null,
    contractor: contractorName(d.contractor),
    gross_amount: null as number | null,
    deduction: null as number | null,
    net_amount: legacyNet.length ? legacyNet[legacyNet.length - 1]! : null,
    bill_ids: d.bill_ids ?? null,
    zone: d.zone ?? null,
    division: d.division ?? null,
    sub_division: d.sub_division ?? null,
  };
}
