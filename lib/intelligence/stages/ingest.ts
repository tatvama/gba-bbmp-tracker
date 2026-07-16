import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Stage 1 — Ingest. Gathers ALL raw case material (complaint + its documents +
 * the linked job's documents/audit/child-tables + correspondence). Reads
 * whatever OCR text / AI extraction ALREADY exists on each document — every
 * upload path (lib/ocr/process-document.ts) already analyzes a document as
 * soon as it lands, so by the time a case reaches drafting its documents are
 * normally already analyzed. This stage deliberately does NOT import that OCR/
 * analysis pipeline itself: it transitively pulls in the native PDF-rendering
 * binding (@napi-rs/canvas), and this module is reachable from the background
 * escalation sweeper (lib/complaints/escalation-scheduler.ts, started from
 * instrumentation.ts) — which bundles under stricter resolution rules that
 * cannot resolve that native binding (see the warning in instrumentation.ts).
 * Every downstream stage already degrades gracefully when a document has no
 * analysis yet, so this is a safe, deliberate boundary, not a shortcut.
 */

export interface RawDoc {
  id: string;
  source: "complaint_documents" | "job_documents";
  documentType: string | null;
  name: string;
  ocrText: string;
  aiSummary: string | null;
  aiExtractedJson: unknown;
  documentDate: string | null;
  /** Cached unconditional reference-fact extraction (document-facts.ts), keyed
   *  by documentFactsHash so the stage only re-runs AI on new/changed docs. */
  documentFacts: unknown;
  documentFactsHash: string | null;
}

export interface RawCaseMaterial {
  complaint: Record<string, any>;
  jobNumber: string | null;
  complaintDocs: RawDoc[];
  jobDocs: RawDoc[];
  jobAudit: { id: string; report: any; risk_score: number | null; risk_band: string | null; total_exposure: any } | null;
  jobCase: Record<string, any> | null;
  billAudits: any[];
  replies: any[];
  actions: any[];
  timeline: any[];
  escalations: any[];
  runningBills: any[];
  jobTimelineDates: any[];
  aiDrafts: any[];
  coverage: { documentsTotal: number; documentsAnalyzed: number; capped: boolean };
}

const asText = (r: any): string => ((r?.ocr_clean_text as string) || (r?.ocr_raw_text as string) || "").trim();

export async function ingestCaseMaterial(
  admin: SupabaseClient,
  complaintId: string,
): Promise<RawCaseMaterial | null> {
  const { data: complaint } = await admin
    .from("complaints")
    .select("*, ward:wards!ward_id(new_no,new_name), eng_subdivision:eng_subdivisions!eng_subdivision_id(name), assigned_engineer:contacts!assigned_engineer_id(id,full_name,designation,office_address,phone,email)")
    .eq("id", complaintId)
    .single();
  if (!complaint) return null;
  const jobNumber = (complaint.job_number as string | null) ?? null;

  const [cDocsRes, timelineRes, repliesRes, actionsRes, escalationsRes, aiDraftsRes] = await Promise.all([
    admin.from("complaint_documents")
      .select("id, document_type, title, original_file_name, ocr_clean_text, ocr_raw_text, ai_summary, ai_extracted_json, ai_summary_status, document_date, document_facts, document_facts_hash")
      .eq("complaint_id", complaintId)
      .order("created_at", { ascending: true }),
    admin.from("complaint_timeline").select("id, event_date, event_type, title, summary").eq("complaint_id", complaintId).order("event_date", { ascending: true }).limit(200),
    admin.from("complaint_replies").select("id, reply_date, replied_by_name, reply_summary, reply_full_text, issues_remaining, is_satisfactory").eq("complaint_id", complaintId).order("reply_date", { ascending: true }).limit(100),
    admin.from("complaint_action_taken").select("id, action_taken_date, action_summary, action_details, pending_work").eq("complaint_id", complaintId).order("action_taken_date", { ascending: true }).limit(100),
    admin.from("escalation_logs").select("id, escalated_on, to_level, reason, response_received").eq("entity_id", complaintId).eq("entity_type", "complaint").order("escalated_on", { ascending: true }).limit(50),
    admin.from("ai_drafts").select("id, kind, content, language, created_at").eq("entity_type", "complaint").eq("entity_id", complaintId).order("created_at", { ascending: true }).limit(50),
  ]);

  const cRows = cDocsRes.data ?? [];

  const complaintDocs: RawDoc[] = (cDocsRes.data ?? []).map((d) => ({
    id: d.id as string,
    source: "complaint_documents",
    documentType: (d.document_type as string) ?? null,
    name: (d.title as string) || (d.original_file_name as string) || (d.id as string),
    ocrText: asText(d),
    aiSummary: (d.ai_summary as string) ?? null,
    aiExtractedJson: d.ai_extracted_json ?? null,
    documentDate: (d.document_date as string) ?? null,
    documentFacts: d.document_facts ?? null,
    documentFactsHash: (d.document_facts_hash as string) ?? null,
  }));

  // Job side (only when the complaint is linked to a job).
  let jobDocs: RawDoc[] = [];
  let jobAudit: RawCaseMaterial["jobAudit"] = null;
  let jobCase: Record<string, any> | null = null;
  let runningBills: any[] = [];
  let jobTimelineDates: any[] = [];
  let billAudits: any[] = [];

  const billAuditsP = admin.from("bill_audits").select("id, document_id, extracted, findings, grand_total, red_flag_count, score").eq("complaint_id", complaintId);

  if (jobNumber) {
    const [jDocsRes, jAuditRes, jCaseRes, rbRes, jtdRes, baRes] = await Promise.all([
      admin.from("job_documents")
        .select("id, document_type, original_file_name, title, ocr_clean_text, ocr_raw_text, ai_summary, ai_extracted_json, document_facts, document_facts_hash")
        .eq("job_number", jobNumber)
        .order("created_at", { ascending: true }),
      admin.from("job_audits").select("id, report, risk_score, risk_band, total_exposure").eq("job_number", jobNumber).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("job_cases").select("*").eq("job_number", jobNumber).maybeSingle(),
      admin.from("job_running_bills").select("bill_no, bill_date, this_bill, total_upto_date, item_code").eq("job_number", jobNumber).limit(200),
      admin.from("job_timeline_dates").select("event, event_date, raw").eq("job_number", jobNumber).limit(200),
      billAuditsP,
    ]);
    jobDocs = (jDocsRes.data ?? []).map((d) => ({
      id: d.id as string,
      source: "job_documents",
      documentType: (d.document_type as string) ?? null,
      name: (d.title as string) || (d.original_file_name as string) || (d.id as string),
      ocrText: asText(d),
      aiSummary: (d.ai_summary as string) ?? null,
      aiExtractedJson: d.ai_extracted_json ?? null,
      documentDate: null,
      documentFacts: d.document_facts ?? null,
      documentFactsHash: (d.document_facts_hash as string) ?? null,
    }));
    jobAudit = (jAuditRes.data as any) ?? null;
    jobCase = (jCaseRes.data as any) ?? null;
    runningBills = rbRes.data ?? [];
    jobTimelineDates = jtdRes.data ?? [];
    billAudits = baRes.data ?? [];
  } else {
    billAudits = (await billAuditsP).data ?? [];
  }

  const documentsTotal = complaintDocs.length + jobDocs.length;
  const documentsAnalyzed =
    complaintDocs.filter((d) => d.aiSummary || d.aiExtractedJson).length +
    jobDocs.filter((d) => d.aiSummary || d.aiExtractedJson).length;

  return {
    complaint,
    jobNumber,
    complaintDocs,
    jobDocs,
    jobAudit,
    jobCase,
    billAudits,
    replies: repliesRes.data ?? [],
    actions: actionsRes.data ?? [],
    timeline: timelineRes.data ?? [],
    escalations: escalationsRes.data ?? [],
    runningBills,
    jobTimelineDates,
    aiDrafts: aiDraftsRes.data ?? [],
    // "capped" here means some documents have no OCR/AI analysis yet (they were
    // never analyzed at upload time, or analysis is still in progress) — not a
    // processing-budget limit, since this stage no longer triggers analysis itself.
    coverage: { documentsTotal, documentsAnalyzed, capped: documentsAnalyzed < documentsTotal },
  };
}
