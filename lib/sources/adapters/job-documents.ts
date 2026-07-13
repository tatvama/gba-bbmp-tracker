import "server-only";
/**
 * Work Order / Estimate Documents adapter — a byproduct of documents already
 * on file in job_documents (populated by either the IFMS downloader or the
 * forensic-ZIP-import pipeline), filtered by document_type. Reports no
 * structured facts (a scanned PDF's content isn't parsed here) but a real
 * citation per matching document, tagged by its actual source (portal vs.
 * manually scanned upload) so the citation's URL honestly reflects where the
 * evidence lives.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { registerSourceAdapter } from "@/lib/sources/registry";
import type { SourceId, WorkSourceAdapter, WorkSourceAdapterResult, WorkSourceQuery } from "@/lib/sources/types";

const DOC_TYPES = ["Work order copy", "Estimate copy"];

async function search(query: WorkSourceQuery): Promise<WorkSourceAdapterResult> {
  if (!query.jobNumber) return { ok: true, facts: [], citation: null };
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("job_documents")
    .select("document_type, original_file_name, source, storage_path")
    .eq("job_number", query.jobNumber)
    .in("document_type", DOC_TYPES)
    .limit(1);
  if (error) return { ok: false, facts: [], citation: null, error: error.message };
  const doc = data?.[0];
  if (!doc) return { ok: true, facts: [], citation: null };

  // zip_import documents have no public source URL — cite this app's own
  // record rather than fabricating an external government URL.
  const sourceId: SourceId = doc.document_type === "Estimate copy" ? "estimate_documents" : "work_order_documents";
  return {
    ok: true,
    facts: [],
    citation: {
      sourceId,
      url: doc.source === "ifms_portal" ? null : `internal:job-documents/${query.jobNumber}`,
      documentName: doc.original_file_name,
      referenceNumber: null,
      pageNumber: null,
      isOfficial: true,
    },
  };
}

const workOrderAdapter: WorkSourceAdapter = {
  id: "work_order_documents",
  displayName: "Work Order Documents",
  kind: "app_table",
  requiresNetwork: false,
  search,
};

const estimateAdapter: WorkSourceAdapter = {
  id: "estimate_documents",
  displayName: "Estimate Documents",
  kind: "app_table",
  requiresNetwork: false,
  search,
};

registerSourceAdapter(workOrderAdapter);
registerSourceAdapter(estimateAdapter);
