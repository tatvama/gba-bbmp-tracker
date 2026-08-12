"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db";
import { requireRole, AuthorizationError } from "@/lib/auth";
import { writeAudit, diffFields } from "@/lib/audit";
import { WRITE_ROLES } from "@/lib/constants";
import { WORK_VERIFICATION_STATUSES } from "@/lib/bbmp-works/types";
import { normalizeJobNumber } from "@/lib/bbmp-works/normalize";
import type { ActionState } from "@/lib/actions/contacts";

/** "" (or non-string) -> null, otherwise the trimmed string. */
function str(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t === "" ? null : t;
}

/** "" -> null, otherwise Number(...); a non-finite result also folds to null
 *  rather than writing NaN into a numeric column. */
function num(v: unknown): number | null {
  const t = typeof v === "string" ? v.trim() : "";
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Admin correction tool for a single bbmp_works row — same "fix a wrong or
 * incomplete value, keep an audit trail" philosophy as updateWard
 * (lib/actions/wards.ts) and updateAcknowledgmentDateAction
 * (lib/actions/complaints.ts). There is no create/insert counterpart here:
 * bbmp_works rows are created by the search/ingest pipeline
 * (lib/sources/ingest.ts), never by hand.
 *
 * official_source_count / latest_update are deliberately NOT editable here —
 * they're recomputed from work_sources by lib/bbmp-works/verification.ts
 * after every source ingest, so a manual edit would just be overwritten by
 * the next ingest. id/created_at/updated_at are likewise system-managed.
 */
export async function updateBbmpWork(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }

  const obj: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) obj[k] = v;

  // verification_status is NOT NULL with a DB check constraint (spec: one of
  // WORK_VERIFICATION_STATUSES) — validate before writing so a tampered/
  // malformed submission gets a friendly error instead of a DB error.
  const verificationStatus = String(obj.verificationStatus ?? "").trim();
  if (!WORK_VERIFICATION_STATUSES.includes(verificationStatus as never)) {
    return {
      error: "Please fix the errors below.",
      fieldErrors: { verificationStatus: "Select a valid verification status" },
    };
  }

  const db = await createClient();
  const { data: before } = await db.from("bbmp_works").select("*").eq("id", id).single();
  if (!before) return { error: "Work record not found." };

  const row = {
    // job/work number run through normalizeJobNumber (same canonicalization
    // the search tiers use) so a corrected number stays exact-match-findable.
    job_number: normalizeJobNumber(str(obj.jobNumber)),
    work_number: normalizeJobNumber(str(obj.workNumber)),
    project_id: str(obj.projectId),
    work_name: str(obj.workName),
    work_description: str(obj.workDescription),
    work_category: str(obj.workCategory),
    work_type: str(obj.workType),
    ward_number: str(obj.wardNumber),
    ward_name: str(obj.wardName),
    zone: str(obj.zone),
    division_name: str(obj.divisionName),
    sub_division_name: str(obj.subDivisionName),
    department_name: str(obj.departmentName),
    scheme_name: str(obj.schemeName),
    grant_type: str(obj.grantType),
    budget_head: str(obj.budgetHead),
    financial_year: str(obj.financialYear),
    estimate_amount: num(obj.estimateAmount),
    sanctioned_amount: num(obj.sanctionedAmount),
    tender_amount: num(obj.tenderAmount),
    tender_number: str(obj.tenderNumber),
    tender_date: str(obj.tenderDate),
    tender_status: str(obj.tenderStatus),
    work_order_number: str(obj.workOrderNumber),
    work_order_date: str(obj.workOrderDate),
    administrative_approval_number: str(obj.administrativeApprovalNumber),
    technical_sanction_number: str(obj.technicalSanctionNumber),
    start_date: str(obj.startDate),
    expected_completion_date: str(obj.expectedCompletionDate),
    actual_completion_date: str(obj.actualCompletionDate),
    progress_percentage: num(obj.progressPercentage),
    physical_progress: str(obj.physicalProgress),
    paid_amount: num(obj.paidAmount),
    engineer_name: str(obj.engineerName),
    engineer_phone: str(obj.engineerPhone),
    engineer_email: str(obj.engineerEmail),
    assistant_engineer: str(obj.assistantEngineer),
    assistant_executive_engineer: str(obj.assistantExecutiveEngineer),
    executive_engineer: str(obj.executiveEngineer),
    superintending_engineer: str(obj.superintendingEngineer),
    chief_engineer: str(obj.chiefEngineer),
    contractor_name: str(obj.contractorName),
    contractor_address: str(obj.contractorAddress),
    contractor_phone: str(obj.contractorPhone),
    contractor_email: str(obj.contractorEmail),
    contractor_registration_number: str(obj.contractorRegistrationNumber),
    location_description: str(obj.locationDescription),
    road_name: str(obj.roadName),
    layout_name: str(obj.layoutName),
    latitude: num(obj.latitude),
    longitude: num(obj.longitude),
    work_status: str(obj.workStatus),
    verification_status: verificationStatus,
    remarks: str(obj.remarks),
  };

  const { error } = await db.from("bbmp_works").update(row).eq("id", id);
  if (error) return { error: error.message };

  await writeAudit(db, {
    entityType: "bbmp_work",
    entityId: id,
    changedBy: user.id,
    changes: diffFields(before, row),
  });

  revalidatePath(`/bbmp-works/${id}`);
  if (before.job_number) revalidatePath(`/bbmp-works/job/${before.job_number}`);
  revalidatePath("/bbmp-works/search");
  return { success: true, id };
}
