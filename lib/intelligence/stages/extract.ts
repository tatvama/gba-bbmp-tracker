import type { RawCaseMaterial, RawDoc } from "./ingest";
import type { Store } from "../builder";
import type { OfficerRef, Reference } from "../types";

/**
 * Stage 2 — Understand & Extract (Phase 1: deterministic, reuse-only). Reads the
 * ALREADY-extracted structured data (job_cases, the rich_json ForensicDataset in
 * job_documents.ai_extracted_json, per-doc ComplaintExtraction, job_audits
 * forensicSkill) into evidence-linked entities. New GO / tender / MDP AI
 * extractors plug in here in Phase 2.
 */

const GSTIN_RE = /\b\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]\b/;
const PAN_RE = /\b[A-Z]{5}\d{4}[A-Z]\b/;

export interface ExtractResult {
  contractor: { name: string | null; class?: string | null; gstin?: string | null; pan?: string | null; agreementNo?: string | null; evidenceIds: string[] };
  officers: OfficerRef[];
  recipients: { designation: string; name?: string | null; office?: string | null }[];
  references: Reference[];
  project: { workDescription: string | null; ward?: string | null; division?: string | null; subDivision?: string | null; zone?: string | null };
}

/** The rich forensic dataset doc (skill JSON) among the job documents, if any. */
function findDataset(jobDocs: RawDoc[]): Record<string, any> | null {
  for (const d of jobDocs) {
    const j = d.aiExtractedJson as Record<string, any> | null;
    if (j && typeof j === "object" && (j.work || j.grounds || j.overall_risk || j.contractor)) return j;
  }
  return null;
}
function datasetDocId(jobDocs: RawDoc[]): string | null {
  const d = jobDocs.find((x) => {
    const j = x.aiExtractedJson as Record<string, any> | null;
    return j && typeof j === "object" && (j.work || j.grounds || j.overall_risk || j.contractor);
  });
  return d?.id ?? null;
}

export function extractEntities(material: RawCaseMaterial, store: Store): ExtractResult {
  const { complaint, jobCase, jobDocs, jobAudit, complaintDocs } = material;
  const dataset = findDataset(jobDocs);
  const dsDocId = datasetDocId(jobDocs);
  const forensicSkill = (jobAudit?.report?.forensicSkill ?? null) as Record<string, any> | null;

  // ── Contractor ────────────────────────────────────────────────────────────
  const contractorEvidence: string[] = [];
  let contractorName: string | null = null;
  let contractorClass: string | null = null;
  let gstin: string | null = null;
  let pan: string | null = null;

  // Only accept GSTIN/PAN that actually match their formats — the source skill
  // sometimes writes a note (e.g. "verification needed, GST image unreadable")
  // into these fields, which must never surface in a letter as a real GSTIN/PAN.
  const validGstin = (v: unknown): string | null => (typeof v === "string" && GSTIN_RE.test(v) ? v.match(GSTIN_RE)![0] : null);
  const validPan = (v: unknown): string | null => (typeof v === "string" && PAN_RE.test(v) ? v.match(PAN_RE)![0] : null);

  const dsContractor = dataset?.contractor;
  if (typeof dsContractor === "object" && dsContractor) {
    contractorName = dsContractor.name ?? null;
    contractorClass = dsContractor.class ?? null;
    gstin = validGstin(dsContractor.gstin);
    pan = validPan(dsContractor.pan);
  } else if (typeof dsContractor === "string") {
    contractorName = dsContractor;
  }
  const contractorText = [typeof dsContractor === "string" ? dsContractor : "", jobCase?.contractor, forensicSkill?.contractor]
    .filter(Boolean).join(" ");
  if (!gstin) gstin = contractorText.match(GSTIN_RE)?.[0] ?? null;
  if (!pan) pan = contractorText.match(PAN_RE)?.[0] ?? null;
  // identity_rows fallback
  for (const row of (dataset?.identity_rows ?? []) as { label?: string; value?: string }[]) {
    const label = (row.label ?? "").toLowerCase();
    if (!gstin && /gst/.test(label)) gstin = (row.value ?? "").match(GSTIN_RE)?.[0] ?? gstin;
    if (!pan && /pan/.test(label)) pan = (row.value ?? "").match(PAN_RE)?.[0] ?? pan;
    if (!contractorName && /contractor|agency|firm/.test(label)) contractorName = row.value ?? contractorName;
  }
  if (!contractorName && jobCase?.contractor) contractorName = jobCase.contractor as string;
  if (contractorName || gstin || pan) {
    const evId = store.addEvidence({
      sourceTable: dsDocId ? "job_documents" : "job_cases",
      sourceDocId: dsDocId ?? (jobCase?.job_number ?? null),
      docType: "Forensic dataset / job case",
      page: null,
      extract: contractorText || contractorName || "",
      confidence: dataset ? "High" : "Medium",
    });
    contractorEvidence.push(evId);
  }

  // ── Officers ──────────────────────────────────────────────────────────────
  const officers: OfficerRef[] = [];
  const seenOfficers = new Set<string>();
  const addOfficer = (name: string | null | undefined, designation: string | null | undefined, office: string | null, role: string, contactId: string | null, evId: string | null) => {
    const nm = (name ?? "").trim();
    if (!nm) return;
    const key = nm.toLowerCase();
    const existing = officers.find((o) => o.name.toLowerCase() === key);
    if (existing) {
      if (!existing.roles.includes(role)) existing.roles.push(role);
      if (evId && !existing.evidenceIds.includes(evId)) existing.evidenceIds.push(evId);
      return;
    }
    if (seenOfficers.has(key)) return;
    seenOfficers.add(key);
    officers.push({ id: store.offId(), name: nm, designation: designation ?? null, office, contactId, roles: [role], evidenceIds: evId ? [evId] : [] });
  };

  const ae = complaint.assigned_engineer;
  if (ae?.full_name) {
    const evId = store.addEvidence({ sourceTable: "complaint", sourceDocId: complaint.id, docType: "Assigned engineer", page: null, extract: `${ae.full_name}, ${ae.designation ?? ""}`, confidence: "High" });
    addOfficer(ae.full_name, ae.designation, ae.office_address ?? null, "responsible", ae.id ?? null, evId);
  }
  for (const d of complaintDocs) {
    const ex = d.aiExtractedJson as Record<string, any> | null;
    const names = (ex?.officerNames ?? []) as string[];
    if (names.length) {
      const evId = store.addEvidence({ sourceTable: "complaint_documents", sourceDocId: d.id, docType: d.documentType, page: null, extract: names.join(", "), confidence: "Medium" });
      for (const n of names) addOfficer(n, null, null, "named", null, evId);
    }
  }

  // ── Recipients ────────────────────────────────────────────────────────────
  const recipients: { designation: string; name?: string | null; office?: string | null }[] = [];
  recipients.push({
    designation: ae?.designation || "Executive Engineer",
    name: ae?.full_name ?? null,
    office: [complaint.eng_subdivision?.name ? `${complaint.eng_subdivision.name} Sub-division` : "", ae?.office_address ?? ""].filter(Boolean).join(", ") || "Bruhat Bengaluru Mahanagara Palike (BBMP)",
  });

  // ── References ────────────────────────────────────────────────────────────
  const references: Reference[] = [];
  const addRef = (label: string, value: unknown, table: "job_cases" | "complaint", docId: string | null) => {
    const v = (value ?? "").toString().trim();
    if (!v) return;
    const evId = store.addEvidence({ sourceTable: table, sourceDocId: docId, docType: label, page: null, extract: `${label}: ${v}`, confidence: "High" });
    references.push({ label, value: v, evidenceIds: [evId] });
  };
  if (material.jobNumber) addRef("Job Number", material.jobNumber, "complaint", complaint.id);
  if (complaint.complaint_number) addRef("External complaint number", complaint.complaint_number, "complaint", complaint.id);
  if (jobCase) {
    addRef("Work Order", jobCase.wo_ref || jobCase.wo_id, "job_cases", jobCase.job_number ?? null);
    addRef("Bill", jobCase.bill_ids, "job_cases", jobCase.job_number ?? null);
    addRef("BR Number", jobCase.br_number, "job_cases", jobCase.job_number ?? null);
  }

  // ── Project ───────────────────────────────────────────────────────────────
  const project = {
    workDescription: (jobCase?.description as string) || (dataset?.work as string) || (complaint.title as string) || null,
    ward: complaint.ward?.new_name ? `${complaint.ward.new_no} ${complaint.ward.new_name}` : (dataset?.wards ?? jobCase?.ward ?? null),
    division: (jobCase?.division as string) || (dataset?.division as string) || null,
    subDivision: complaint.eng_subdivision?.name || (jobCase?.sub_division as string) || (dataset?.sub_division as string) || null,
    zone: (jobCase?.zone as string) || (dataset?.zone as string) || null,
  };

  return {
    contractor: { name: contractorName, class: contractorClass, gstin, pan, agreementNo: null, evidenceIds: contractorEvidence },
    officers,
    recipients,
    references,
    project,
  };
}
