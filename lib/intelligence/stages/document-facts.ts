import "server-only";
import { extractDocumentFactsFromText, type DocumentFactsExtraction, type DocRefItem } from "@/lib/ai/extractors/document-facts";
import { mapWithConcurrency } from "@/lib/utils/concurrency";
import type { RawCaseMaterial, RawDoc } from "./ingest";
import type { Store } from "../builder";
import type { Reference, ComplianceItem } from "../types";

/**
 * Stage — Document Fact Extraction (unconditional). Reads EVERY document's text
 * and pulls AA/TS/agreement(KW-4)/work-order/tender/MDP/royalty/insurance
 * reference numbers, regardless of whether anything is wrong with them — unlike
 * the forensic finding stages, which only surface a fact when it's part of a
 * flagged issue. This is what lets a letter cite "Administrative Approval No. X
 * dated Y" or note a Technical Sanction on record even when there's no dispute
 * about it. Best-effort: a single document's extraction failure never sinks the
 * stage; AI-off returns nothing (never throws).
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

const fmt = (item: DocRefItem): string => [item.number, item.date, item.amount, item.extra].filter(Boolean).join(" | ");
const asText = (d: RawDoc): string => (d.ocrText || d.aiSummary || "").trim();

export async function buildDocumentFacts(
  material: RawCaseMaterial,
  store: Store,
): Promise<{ references: Reference[]; compliance: ComplianceItem[] }> {
  const docs = [...material.complaintDocs, ...material.jobDocs].filter((d) => asText(d).length > 12).slice(0, DOC_CAP);
  if (!docs.length) return { references: [], compliance: [] };

  const perDoc = await mapWithConcurrency(docs, CONCURRENCY, async (d) => {
    try {
      const facts = await extractDocumentFactsFromText(asText(d), true);
      return { doc: d, facts };
    } catch {
      return null;
    }
  });

  // The same reference (e.g. one AA / TS number) commonly appears across several
  // documents; dedupe per (label + reference number) so the letter cites each
  // reference once, keeping the richest occurrence (most number/date/amount
  // detail) and merging every source document's evidence onto it.
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
        // Dedupe key: the reference number if present, else the whole value.
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
