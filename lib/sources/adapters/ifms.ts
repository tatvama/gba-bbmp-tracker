/**
 * BBMP IFMS adapter — wraps lib/ifms/downloader.ts (already written, tested,
 * and orphaned since the 2026-07-07 cleanup deleted its old UI/action layer;
 * the HTTP/parsing client itself was never broken). Covers "Bill and Payment
 * Records" (via getJobBills — see note below on why amounts aren't extracted)
 * and, as a byproduct, "Work Order Documents"/"Estimate Documents" file
 * listings.
 *
 * Deliberately does NOT parse a bill amount out of PortalBill — the raw
 * portal payload's extra fields are untyped/undocumented (see
 * lib/ifms/downloader.ts's `[k: string]: unknown`), and this codebase has no
 * proven extraction for them. Fabricating an amount field from a guessed key
 * would violate the "don't display unverified info" principle the rest of
 * this app follows — so this adapter reports only what the downloader
 * already parses for certain: description and WO/bill reference strings.
 */
import { getJobFiles, PORTAL_BASE } from "@/lib/ifms/downloader";
import { registerSourceAdapter } from "@/lib/sources/registry";
import type { SourceFact, WorkSourceAdapter, WorkSourceAdapterResult, WorkSourceQuery } from "@/lib/sources/types";

async function search(query: WorkSourceQuery): Promise<WorkSourceAdapterResult> {
  if (!query.jobNumber) return { ok: true, facts: [], citation: null };

  let result;
  try {
    result = await getJobFiles(query.jobNumber);
  } catch (e) {
    return { ok: false, facts: [], citation: null, error: e instanceof Error ? e.message : String(e) };
  }
  if (!result.exists) return { ok: true, facts: [], citation: null };

  const facts: SourceFact[] = [];
  if (result.meta.description) facts.push({ field: "workDescription", value: result.meta.description });
  if (result.meta.woRef) facts.push({ field: "remarks", value: `WO/Bill ref (IFMS): ${result.meta.woRef}` });

  return {
    ok: true,
    facts,
    citation: {
      sourceId: "bbmp_ifms",
      url: `${PORTAL_BASE}/vsswb/`,
      documentName: null,
      referenceNumber: result.meta.billIds || null,
      pageNumber: null,
      isOfficial: true,
    },
  };
}

async function checkReachable() {
  const { checkPortalReachable } = await import("@/lib/ifms/downloader");
  return checkPortalReachable();
}

const adapter: WorkSourceAdapter = {
  id: "bbmp_ifms",
  displayName: "BBMP IFMS",
  kind: "live_api",
  requiresNetwork: true,
  search,
  checkReachable,
};

registerSourceAdapter(adapter);
export default adapter;
