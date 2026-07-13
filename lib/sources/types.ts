/**
 * One entry per source named in the BBMP work-search spec. Every named
 * source is equally "official" for the verification-tiering rule (2+
 * official sources = Verified) — this enum exists so a citation always
 * records WHICH of the spec's sources it came from, not to distinguish
 * automated from manual ones (see WorkSourceAdapter.kind for that).
 */
export const SOURCE_IDS = [
  "bbmp_official_portal",
  "bbmp_ifms",
  "bbmp_works_portal",
  "bbmp_engineering_dept_records",
  "karnataka_public_procurement_portal",
  "karnataka_eprocurement_portal",
  "tender_documents",
  "work_order_documents",
  "estimate_documents",
  "bill_and_payment_records",
  "ward_engineering_records",
  "division_records",
  "sub_division_records",
  "council_meeting_documents",
  "budget_documents",
  "rti_documents",
  "government_orders",
  "official_officer_directory",
  "public_government_pdf_documents",
  "official_department_websites",
] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

export const SOURCE_DISPLAY_NAME: Record<SourceId, string> = {
  bbmp_official_portal: "BBMP Official Portal",
  bbmp_ifms: "BBMP IFMS",
  bbmp_works_portal: "BBMP Works Portal",
  bbmp_engineering_dept_records: "BBMP Engineering Department Records",
  karnataka_public_procurement_portal: "Karnataka Public Procurement Portal",
  karnataka_eprocurement_portal: "Karnataka e-Procurement Portal",
  tender_documents: "Tender Documents",
  work_order_documents: "Work Order Documents",
  estimate_documents: "Estimate Documents",
  bill_and_payment_records: "Bill and Payment Records",
  ward_engineering_records: "Ward Engineering Records",
  division_records: "Division Records",
  sub_division_records: "Sub Division Records",
  council_meeting_documents: "Council Meeting Documents",
  budget_documents: "Budget Documents",
  rti_documents: "RTI Documents",
  government_orders: "Government Orders",
  official_officer_directory: "Official Officer Directory",
  public_government_pdf_documents: "Public Government PDF Documents",
  official_department_websites: "Official Department Websites",
};

/** One fact asserted by one source about one work — the unit an adapter
 *  returns. `field` matches a key on lib/bbmp-works/types.ts's BBMPWorkDetails
 *  (camelCase), so ingestFacts (lib/sources/ingest.ts) can write it straight
 *  onto the matching bbmp_works column. */
export interface SourceFact {
  field: string;
  value: unknown;
}

export interface SourceCitation {
  sourceId: SourceId;
  url: string | null;
  documentName: string | null;
  referenceNumber: string | null;
  pageNumber: number | null;
  /** True for the 20 sources named in the spec — always true today; kept for
   *  future-proofing if a non-official adapter is ever added. */
  isOfficial: boolean;
}

export interface WorkSourceAdapterResult {
  ok: boolean;
  facts: SourceFact[];
  citation: SourceCitation | null;
  error?: string;
}

export interface WorkSourceQuery {
  jobNumber?: string;
  wardYear?: string;
  wardNumber?: string;
  /** Plain division/sub-division NAME (bbmp_works stores names, not FK ids) —
   *  used by the contacts (Official Officer Directory) adapter to scope its
   *  lookup, since that data is organized by division/sub-division, not job. */
  divisionName?: string;
  subDivisionName?: string;
}

export interface WorkSourceAdapter {
  id: SourceId;
  displayName: string;
  kind: "live_api" | "app_table" | "manual_entry_only";
  /** live_api adapters that hit a real network endpoint must run inside the
   *  source_fetch background job, never inline in a request handler. */
  requiresNetwork: boolean;
  search(query: WorkSourceQuery): Promise<WorkSourceAdapterResult>;
  checkReachable?(): Promise<{ ok: boolean; error?: string }>;
}
