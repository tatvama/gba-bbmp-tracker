import "server-only";
import type { DbClient } from "@/lib/db";
import { recomputeVerification } from "@/lib/bbmp-works/verification";
import { SOURCE_DISPLAY_NAME } from "./types";
import type { SourceCitation, SourceFact } from "./types";

/** camelCase BBMPWorkDetails field -> snake_case bbmp_works column. Only
 *  fields an adapter can plausibly report are listed; ingestFacts silently
 *  drops any field not in this map rather than failing the whole ingest. */
const FIELD_TO_COLUMN: Record<string, string> = {
  jobNumber: "job_number",
  workNumber: "work_number",
  workName: "work_name",
  workDescription: "work_description",
  wardNumber: "ward_number",
  wardName: "ward_name",
  zone: "zone",
  divisionName: "division_name",
  subDivisionName: "sub_division_name",
  financialYear: "financial_year",
  estimateAmount: "estimate_amount",
  sanctionedAmount: "sanctioned_amount",
  tenderAmount: "tender_amount",
  tenderNumber: "tender_number",
  tenderDate: "tender_date",
  tenderStatus: "tender_status",
  workOrderNumber: "work_order_number",
  workOrderDate: "work_order_date",
  paidAmount: "paid_amount",
  billNumber: "latest_update", // no dedicated bill_number column; surfaced via latest_update note
  workStatus: "work_status",
  progressPercentage: "progress_percentage",
  engineerName: "engineer_name",
  engineerPhone: "engineer_phone",
  engineerEmail: "engineer_email",
  assistantEngineer: "assistant_engineer",
  assistantExecutiveEngineer: "assistant_executive_engineer",
  executiveEngineer: "executive_engineer",
  superintendingEngineer: "superintending_engineer",
  chiefEngineer: "chief_engineer",
  contractorName: "contractor_name",
  contractorAddress: "contractor_address",
  contractorPhone: "contractor_phone",
  contractorEmail: "contractor_email",
  contractorRegistrationNumber: "contractor_registration_number",
  locationDescription: "location_description",
  roadName: "road_name",
  layoutName: "layout_name",
  latitude: "latitude",
  longitude: "longitude",
  remarks: "remarks",
};

/** Find-or-create the bbmp_works row for a job number, then apply `facts`
 *  (only non-null values overwrite existing columns — a source with a gap
 *  for one field never blanks out a value another source already supplied),
 *  record one work_sources citation, and recompute verification_status.
 *  Returns the work's id. */
export async function ingestFacts(
  db: DbClient,
  params: { jobNumber: string; facts: SourceFact[]; citation: SourceCitation; userId?: string },
): Promise<string> {
  const { jobNumber, facts, citation, userId } = params;

  const { data: existing } = await db
    .from("bbmp_works")
    .select("id")
    .eq("job_number", jobNumber)
    .maybeSingle();

  const patch: Record<string, unknown> = {};
  const snapshot: Record<string, unknown> = {};
  for (const fact of facts) {
    const column = FIELD_TO_COLUMN[fact.field];
    if (!column || fact.value == null || fact.value === "") continue;
    patch[column] = fact.value;
    snapshot[fact.field] = fact.value;
  }

  let workId: string;
  if (existing?.id) {
    workId = existing.id;
    if (Object.keys(patch).length) {
      const { error } = await db.from("bbmp_works").update(patch).eq("id", workId);
      if (error) throw new Error(`ingestFacts: update failed — ${error.message}`);
    }
  } else {
    const { data: inserted, error } = await db
      .from("bbmp_works")
      .insert({ job_number: jobNumber, ...patch, created_by: userId ?? null })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(`ingestFacts: insert failed — ${error?.message}`);
    workId = inserted.id;
  }

  const { error: sourceError } = await db.from("work_sources").insert({
    work_id: workId,
    source_id: citation.sourceId,
    source_name: SOURCE_DISPLAY_NAME[citation.sourceId],
    source_url: citation.url,
    document_name: citation.documentName,
    reference_number: citation.referenceNumber,
    page_number: citation.pageNumber,
    field_snapshot: snapshot,
    is_official: citation.isOfficial,
    created_by: userId ?? null,
  });
  if (sourceError) throw new Error(`ingestFacts: source insert failed — ${sourceError.message}`);

  await recomputeVerification(db, workId);
  return workId;
}
