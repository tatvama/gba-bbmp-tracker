"use server";

import { requireRole, AuthorizationError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMPLAINT_VERIFY_ROLES } from "@/lib/constants";
import { loadSrRates } from "@/lib/sr-rates";
import { runJobAudit, type JobAuditInput, type JobAuditReport, type DocumentMatrixRow } from "@/lib/forensics/job-audit";
import { scoreFinding, gradeEvidence } from "@/lib/forensics/risk-score";
import { extractBillStructure } from "@/lib/ai/bill-extractor";
import { extractMbBill, extractTimelineDates, extractEligibility, extractInsurance, extractRoyalty } from "@/lib/ai/forensic-extractors";
import type { BillFinding, StructuredBill, ScheduleBItem, RunningBill, JobTimelineDates, EligibilityRequirement, InsurancePolicy } from "@/lib/forensics/types";

export interface JobAuditResult {
  ok: boolean;
  report?: JobAuditReport;
  auditId?: string;
  docCount?: number;
  error?: string;
}

const DOC_CAP = 60; // bound AI calls per run

function isBill(t: string) { return /bill|estimate|schedule b/.test(t); }
function isMb(t: string) { return /mb book|measurement/.test(t); }
function isTender(t: string) { return /tender|technical bid|financial bid|registration/.test(t); }
function isInsurance(t: string) { return /insurance|kw-4 agreement/.test(t); }
function isRoyalty(t: string) { return /royalty|trip sheet|weighbridge|c&d|salvage/.test(t); }

/** Aggregate every document of a job, AI-extract, run the deterministic engines, persist. */
export async function runJobAuditAction(jobNumber: string): Promise<JobAuditResult> {
  let user;
  try {
    user = await requireRole(COMPLAINT_VERIFY_ROLES);
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const admin = createAdminClient();

  // All complaints sharing this job number.
  const { data: comps } = await admin
    .from("complaints")
    .select("id, contractor, latitude, longitude, location")
    .eq("job_number", jobNumber)
    .is("deleted_at", null);
  const complaintIds = (comps ?? []).map((c) => c.id as string);
  if (complaintIds.length === 0) {
    return { ok: false, error: `No complaints are linked to job number "${jobNumber}". Set the job number on the relevant complaints first.` };
  }

  // Their documents (with OCR + the photo-forensic flags already computed).
  const { data: docs } = await admin
    .from("complaint_documents")
    .select("id, complaint_id, document_type, ocr_clean_text, ocr_raw_text, is_duplicate, dup_severity, vision_verdict, geo_flag, geo_distance_m")
    .in("complaint_id", complaintIds)
    .limit(2000);
  const allDocs = docs ?? [];

  // Aggregated structured inputs.
  const bills: StructuredBill[] = [];
  const scheduleB: ScheduleBItem[] = [];
  const runningBills: RunningBill[] = [];
  const timeline: JobTimelineDates = {};
  const eligibility: EligibilityRequirement[] = [];
  let insurance: InsurancePolicy[] = [];
  const royalty: JobAuditInput["royalty"] = [];
  const disposal: JobAuditInput["disposal"] = [];
  const salvage: JobAuditInput["salvage"] = [];
  const matrix: DocumentMatrixRow[] = [];
  const extraFindings: BillFinding[] = [];

  let processed = 0;
  for (const d of allDocs) {
    const type = ((d.document_type as string) ?? "").toLowerCase();
    const ocr = ((d.ocr_clean_text as string) || (d.ocr_raw_text as string) || "").trim();
    matrix.push({ docType: (d.document_type as string) ?? "Document", present: true });

    // Carry forward the photo-forensic flags as findings (ties the modules together).
    if (d.is_duplicate) extraFindings.push({ code: "PHOTO-DUP", title: "Duplicate photo across cases/jobs", severity: (d.dup_severity as string) === "High" ? "High" : "Medium", category: "PHOTO", findingClass: "confirmed_mismatch", evidenceGrade: "B", detail: "This image fingerprint already appears on another case/job — see the Duplicate Photo Audit.", recordToDemand: "Original photo + portal upload log + metadata", sourceDocId: d.id as string });
    if (d.geo_flag === "far") extraFindings.push({ code: "PHOTO-GEO", title: "Photo GPS off-site", severity: "High", category: "PHOTO", findingClass: "technical_redflag", evidenceGrade: "E", detail: `Photo EXIF GPS is ${d.geo_distance_m ? `${Math.round(d.geo_distance_m as number)} m` : "far"} from the reported work location.`, recordToDemand: "Original geotagged photo + portal log", sourceDocId: d.id as string });
    if (d.vision_verdict && d.vision_verdict !== "ok") extraFindings.push({ code: "PHOTO-VISION", title: `Photo vision flag: ${d.vision_verdict}`, severity: "Medium", category: "PHOTO", findingClass: "technical_redflag", evidenceGrade: "D", detail: "AI vision review flagged this image (screenshot / stock / mismatch) — verify the original.", recordToDemand: "Original photo + metadata", sourceDocId: d.id as string });

    if (!ocr || ocr.length < 12 || processed >= DOC_CAP) continue;
    processed++;

    // Lifecycle dates from any document.
    const dates = await extractTimelineDates(ocr, d.document_type as string);
    Object.assign(timeline, Object.fromEntries(Object.entries(dates.data).filter(([, v]) => v)));

    if (isBill(type)) {
      const b = await extractBillStructure(ocr);
      if (b.bill.lineItems.length) bills.push(b.bill);
      const mb = await extractMbBill(ocr);
      scheduleB.push(...mb.data.scheduleB.filter((s) => s.description));
      runningBills.push(...mb.data.runningBills);
    } else if (isMb(type)) {
      const mb = await extractMbBill(ocr);
      scheduleB.push(...mb.data.scheduleB.filter((s) => s.description));
      runningBills.push(...mb.data.runningBills);
    } else if (isTender(type)) {
      const e = await extractEligibility(ocr);
      eligibility.push(...e.data.requirements.filter((r) => r.label));
    } else if (isInsurance(type)) {
      const ins = await extractInsurance(ocr);
      insurance = insurance.concat(ins.data.policies.filter((p) => p.type));
    } else if (isRoyalty(type)) {
      const r = await extractRoyalty(ocr);
      royalty!.push(...r.data.royalty.filter((x) => x.billedMaterialQty));
      disposal!.push(...r.data.disposal);
      salvage!.push(...r.data.salvage);
    }
  }

  const srBook = await loadSrRates(admin);

  const input: JobAuditInput = {
    jobNumber,
    bills, scheduleB, runningBills, timeline,
    eligibility,
    insurance: insurance.length ? { policies: insurance, ctx: { completion: timeline.completion ?? null, commencement: timeline.commencement ?? null } } : undefined,
    royalty, disposal, salvage,
    srBook,
    documentsForMatrix: matrix,
  };

  const report = runJobAudit(input);

  // Merge photo-forensic findings + re-rank.
  for (const f of extraFindings) {
    if (!f.evidenceGrade) f.evidenceGrade = gradeEvidence(f);
    f.riskPoints = scoreFinding(f);
  }
  report.findings.push(...extraFindings);
  report.rankedFindings = [...report.findings].sort((a, b) => (b.riskPoints ?? 0) - (a.riskPoints ?? 0));
  report.counts = { findings: report.findings.length, redFlags: report.findings.filter((f) => f.severity !== "Low").length };
  // recompute risk including photo findings
  const total = Math.min(100, report.findings.reduce((s, f) => s + (f.riskPoints ?? 0), 0));
  report.risk.score = total;
  report.risk.band = total >= 76 ? "bill_stop" : total >= 51 ? "serious" : total >= 26 ? "procedural" : "low";

  // Persist the aggregate report.
  const { data: ins, error } = await admin
    .from("job_audits")
    .insert({
      job_number: jobNumber,
      report,
      risk_score: report.risk.score,
      risk_band: report.risk.band,
      total_exposure: report.loss.totalPossibleExposure || null,
      finding_count: report.counts.findings,
      red_flag_count: report.counts.redFlags,
      doc_count: allDocs.length,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message, report, docCount: allDocs.length };

  return { ok: true, report, auditId: (ins as { id: string }).id, docCount: allDocs.length };
}
