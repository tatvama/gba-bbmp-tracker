import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractDocumentFactsFromText, type DocumentFactsExtraction, type DocRefItem } from "@/lib/ai/extractors/document-facts";
import { mapWithConcurrency } from "@/lib/utils/concurrency";
import { fnv1a64Hex } from "../case-hash";
import type { RawCaseMaterial, RawDoc } from "./ingest";
import type { Store } from "../builder";
import type { Reference, ComplianceItem } from "../types";

/**
 * Stage — Document Fact Extraction (unconditional, per-document cached). Reads
 * EVERY document's text and pulls AA/TS/agreement(KW-4)/work-order/tender/MDP/
 * royalty/insurance reference numbers AND their surrounding detail, regardless
 * of whether anything is wrong with them — unlike the forensic finding stages,
 * which only surface a fact when it's part of a flagged issue.
 *
 * Cached PER DOCUMENT (document_facts / document_facts_hash columns, mig 0041),
 * keyed by a hash of that document's own OCR text: a case with 40 already-
 * processed documents plus 1 brand-new upload only re-runs AI extraction on the
 * new document, not all 41. If a document's text later changes (OCR completes
 * after initially being empty, gets corrected), the hash mismatch re-triggers
 * extraction for that document only. Best-effort throughout: a single
 * document's extraction or cache-write failure never sinks the stage.
 */

const DOC_CAP = 40;
const CONCURRENCY = 5;

interface FactMeta {
  key: keyof DocumentFactsExtraction;
  label: string;
  ruleRef: string;
}

const FACT_META: FactMeta[] = [
  { key: "administrativeApproval", label: "Administrative Approval (AA)", ruleRef: "KTPP Act 1999 & Rules 2000 — Administrative Approval requirement" },
  { key: "technicalSanction", label: "Technical Sanction (TS)", ruleRef: "KTPP Act 1999 & Rules 2000; PWD Code — Technical Sanction requirement" },
  { key: "agreementKw4", label: "Agreement (KW-4)", ruleRef: "KW-4 agreement — Karnataka PWD contract form" },
  { key: "workOrder", label: "Work Order", ruleRef: "KTPP Act 1999 & Rules 2000 — work order issuance" },
  { key: "tenderNotification", label: "Tender Notification", ruleRef: "KTPP Act 1999 & Rules 2000 — tender / e-procurement process" },
  { key: "mineralDispatchPermit", label: "Mineral Dispatch Permit (MDP)", ruleRef: "Karnataka Minor Mineral Concession Rules 1994 (mineral dispatch permit / royalty)" },
  { key: "royaltyChallan", label: "Royalty Challan", ruleRef: "Karnataka Minor Mineral Concession Rules 1994 (royalty)" },
  { key: "insurancePolicy", label: "Insurance Policy", ruleRef: "KW-4 agreement — insurance & performance-security clauses" },
];

/** Every populated field of one reference, labelled, in a fixed readable order. */
function fmt(item: DocRefItem): string {
  const parts: string[] = [];
  if (item.number) parts.push(`No. ${item.number}`);
  if (item.date) parts.push(`dated ${item.date}`);
  if (item.validFrom || item.validTo) parts.push(`Validity: ${item.validFrom ?? "?"} to ${item.validTo ?? "?"}`);
  if (item.amount) parts.push(`Amount: ${item.amount}`);
  if (item.rate) parts.push(`Rate: ${item.rate}`);
  if (item.quantity) parts.push(`Qty: ${item.quantity}`);
  if (item.material) parts.push(`Material: ${item.material}`);
  if (item.contractorName) parts.push(`Contractor: ${item.contractorName}`);
  if (item.completionPeriod) parts.push(`Completion period: ${item.completionPeriod}`);
  if (item.performanceSecurity) parts.push(`Performance security: ${item.performanceSecurity}`);
  if (item.defectLiabilityPeriod) parts.push(`DLP: ${item.defectLiabilityPeriod}`);
  if (item.quarrySource) parts.push(`Source: ${item.quarrySource}`);
  if (item.authority) parts.push(`Authority: ${item.authority}`);
  if (item.insurer) parts.push(`Insurer: ${item.insurer}`);
  if (item.policyType) parts.push(`Type: ${item.policyType}`);
  if (item.tenderType) parts.push(`Tender type: ${item.tenderType}`);
  if (item.publicationPeriod) parts.push(`Published: ${item.publicationPeriod}`);
  if (item.bidders) parts.push(`Bidders: ${item.bidders}`);
  if (item.extra) parts.push(item.extra);
  return parts.join(" | ");
}

const asText = (d: RawDoc): string => (d.ocrText || d.aiSummary || "").trim();

async function getFacts(admin: SupabaseClient, d: RawDoc): Promise<DocumentFactsExtraction> {
  const text = asText(d);
  const hash = fnv1a64Hex(text);
  if (d.documentFactsHash === hash && d.documentFacts) {
    return d.documentFacts as DocumentFactsExtraction;
  }
  const facts = await extractDocumentFactsFromText(text, true);
  try {
    await admin.from(d.source).update({
      document_facts: facts,
      document_facts_hash: hash,
      document_facts_extracted_at: new Date().toISOString(),
    }).eq("id", d.id);
  } catch (e) {
    console.warn("[document-facts] cache write failed", d.source, d.id, e);
  }
  return facts;
}

export async function buildDocumentFacts(
  admin: SupabaseClient,
  material: RawCaseMaterial,
  store: Store,
): Promise<{ references: Reference[]; compliance: ComplianceItem[] }> {
  const docs = [...material.complaintDocs, ...material.jobDocs].filter((d) => asText(d).length > 12).slice(0, DOC_CAP);
  if (!docs.length) return { references: [], compliance: [] };

  const perDoc = await mapWithConcurrency(docs, CONCURRENCY, async (d) => {
    try {
      return { doc: d, facts: await getFacts(admin, d) };
    } catch {
      return null;
    }
  });

  // The same reference (e.g. one AA / TS number) commonly appears across several
  // documents; dedupe per (label + reference number) so the letter cites each
  // reference once, keeping the richest occurrence (most detail) and merging
  // every source document's evidence onto it.
  const references: Reference[] = [];
  const norm = (s: string) => s.toLowerCase().replace(/[\s.,/\-]+/g, "");
  const byKey = new Map<string, Reference>();
  for (const meta of FACT_META) {
    for (const entry of perDoc) {
      if (!entry) continue;
      for (const item of entry.facts[meta.key] ?? []) {
        if (!item.number && !item.date) continue;
        const value = fmt(item) || "present";
        const evId = store.addEvidence({
          sourceTable: entry.doc.source,
          sourceDocId: entry.doc.id,
          docType: entry.doc.documentType,
          page: null,
          extract: value,
          confidence: "Medium",
        });
        const key = `${meta.label}::${norm(item.number || value)}`;
        const existing = byKey.get(key);
        if (existing) {
          if (!existing.evidenceIds.includes(evId)) existing.evidenceIds.push(evId);
          if (value.length > existing.value.length) { existing.value = value; existing.date = item.date ?? existing.date; }
        } else {
          const ref: Reference = { label: meta.label, value, date: item.date ?? null, evidenceIds: [evId] };
          byKey.set(key, ref);
          references.push(ref);
        }
      }
    }
  }

  // Compliance status per area. "not_shown" is only meaningful for a works case
  // (job_number present) — for a non-works citizen complaint, absence of a
  // Technical Sanction etc. isn't a real gap, so we simply say nothing about it.
  const isWorksCase = Boolean(material.jobNumber);
  const compliance: ComplianceItem[] = [];
  for (const meta of FACT_META) {
    const refsForArea = references.filter((r) => r.label === meta.label);
    if (refsForArea.length) {
      compliance.push({
        area: meta.label,
        requirement: `${meta.label} on record`,
        status: "met",
        detail: refsForArea.map((r) => r.value).join("; "),
        ruleRef: meta.ruleRef,
        evidenceIds: refsForArea.flatMap((r) => r.evidenceIds),
      });
    } else if (isWorksCase) {
      compliance.push({
        area: meta.label,
        requirement: `${meta.label} on record`,
        status: "not_shown",
        detail: "Not found in any document supplied for this case.",
        recordToDemand: `Certified copy of the ${meta.label}`,
        ruleRef: meta.ruleRef,
        evidenceIds: [],
      });
    }
  }

  return { references, compliance };
}
