import type { BBMPWorkDetails } from "./types";

/** Flatten one BBMPWorkDetails into a single export row. sources[] is joined
 *  into a "; "-separated summary string, mirroring how old_wards.join("; ")
 *  is already flattened for CSV export elsewhere in this app. */
export function flattenWorkForExport(work: BBMPWorkDetails): Record<string, unknown> {
  return {
    job_number: work.jobNumber ?? "",
    work_number: work.workNumber ?? "",
    work_name: work.workName ?? "",
    ward_number: work.wardNumber ?? "",
    ward_name: work.wardName ?? "",
    zone: work.zone ?? "",
    division: work.divisionName ?? "",
    sub_division: work.subDivisionName ?? "",
    estimate_amount: work.estimateAmount ?? "",
    sanctioned_amount: work.sanctionedAmount ?? "",
    tender_amount: work.tenderAmount ?? "",
    paid_amount: work.paidAmount ?? "",
    pending_amount: work.pendingAmount ?? "",
    contractor_name: work.contractorName ?? "",
    tender_number: work.tenderNumber ?? "",
    work_order_number: work.workOrderNumber ?? "",
    work_status: work.workStatus ?? "",
    progress_percentage: work.progressPercentage ?? "",
    engineer_name: work.engineerName ?? "",
    executive_engineer: work.executiveEngineer ?? "",
    verification_status: work.verificationStatus,
    official_source_count: work.officialSourceCount,
    sources: work.sources.map((s) => s.sourceName).join("; "),
  };
}
