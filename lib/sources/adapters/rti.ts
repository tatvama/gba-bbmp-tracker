import "server-only";
/**
 * RTI Documents adapter — a pure read over the existing rti_applications/
 * rti_documents tables (no scraping; the app already holds this data). Value
 * is mainly as a CITATION source: an RTI reply that references a job number
 * is a genuine independent corroboration of that work's existence, even
 * though free-text reply content isn't reliably structured into individual
 * BBMPWorkDetails fields — so this adapter reports no facts, only a
 * citation, which still counts toward the official-source tiering rule.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { registerSourceAdapter } from "@/lib/sources/registry";
import type { WorkSourceAdapter, WorkSourceAdapterResult, WorkSourceQuery } from "@/lib/sources/types";

async function search(query: WorkSourceQuery): Promise<WorkSourceAdapterResult> {
  if (!query.jobNumber) return { ok: true, facts: [], citation: null };
  const supabase = createAdminClient();

  const { data: rti, error: rtiError } = await supabase
    .from("rti_applications")
    .select("id, internal_ref, rti_number")
    .eq("job_number", query.jobNumber)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (rtiError) return { ok: false, facts: [], citation: null, error: rtiError.message };
  if (!rti) return { ok: true, facts: [], citation: null };

  const { data: doc } = await supabase
    .from("rti_documents")
    .select("title, doc_type, page_count, doc_date")
    .eq("rti_id", rti.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    ok: true,
    facts: [],
    citation: {
      sourceId: "rti_documents",
      url: null,
      documentName: doc?.title ?? doc?.doc_type ?? null,
      referenceNumber: rti.internal_ref ?? rti.rti_number ?? null,
      pageNumber: doc?.page_count ?? null,
      isOfficial: true,
    },
  };
}

const adapter: WorkSourceAdapter = {
  id: "rti_documents",
  displayName: "RTI Documents",
  kind: "app_table",
  requiresNetwork: false,
  search,
};

registerSourceAdapter(adapter);
export default adapter;
