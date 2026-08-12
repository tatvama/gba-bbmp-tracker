import "server-only";
/**
 * Manual-entry sources — the ~15 spec-named sources with no known stable
 * scrapeable endpoint (BBMP Official Portal, BBMP Works Portal, both
 * Karnataka procurement portals, Engineering/Ward/Division/Sub-Division
 * Records, Council Meeting Documents, Budget Documents, Government Orders,
 * Public Government PDFs, Official Department Websites, Tender Documents,
 * Bill and Payment Records). One shared admin form (Phase 4 UI) covers all
 * of them rather than building bespoke scrapers that don't exist — this is
 * the only honest way to satisfy "Source URL mandatory" / "Accessed Date
 * mandatory" for sources this app can't automate.
 *
 * These adapters register with the shared registry purely so
 * allSourceAdapters() enumerates every spec-named source uniformly (e.g. for
 * a future "which sources have we tried?" admin view) — their search() never
 * runs automatically; recordManualCitation() below is the actual write path,
 * called directly by the admin manual-entry form.
 */
import type { DbClient } from "@/lib/db";
import { ingestFacts } from "@/lib/sources/ingest";
import { registerSourceAdapter } from "@/lib/sources/registry";
import type { SourceFact, SourceId, WorkSourceAdapter } from "@/lib/sources/types";

const MANUAL_SOURCE_IDS: SourceId[] = [
  "bbmp_official_portal",
  "bbmp_works_portal",
  "bbmp_engineering_dept_records",
  "karnataka_public_procurement_portal",
  "karnataka_eprocurement_portal",
  "tender_documents",
  "bill_and_payment_records",
  "ward_engineering_records",
  "division_records",
  "sub_division_records",
  "council_meeting_documents",
  "budget_documents",
  "government_orders",
  "public_government_pdf_documents",
  "official_department_websites",
];

for (const id of MANUAL_SOURCE_IDS) {
  const adapter: WorkSourceAdapter = {
    id,
    displayName: id,
    kind: "manual_entry_only",
    requiresNetwork: false,
    search: async () => ({ ok: true, facts: [], citation: null }),
  };
  registerSourceAdapter(adapter);
}

/** Admin manually cites a fact for a work from a source with no scraper.
 *  URL and accessed-date-mandatory rules are enforced by the calling form's
 *  validation (Phase 4), not here — this is a thin, direct wrapper over
 *  ingestFacts. */
export async function recordManualCitation(
  db: DbClient,
  params: {
    jobNumber: string;
    sourceId: SourceId;
    url: string;
    documentName?: string | null;
    referenceNumber?: string | null;
    pageNumber?: number | null;
    facts: SourceFact[];
    userId: string;
  },
): Promise<string> {
  return ingestFacts(db, {
    jobNumber: params.jobNumber,
    facts: params.facts,
    citation: {
      sourceId: params.sourceId,
      url: params.url,
      documentName: params.documentName ?? null,
      referenceNumber: params.referenceNumber ?? null,
      pageNumber: params.pageNumber ?? null,
      isOfficial: true,
    },
    userId: params.userId,
  });
}
