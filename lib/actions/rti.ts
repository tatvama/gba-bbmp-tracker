"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole, AuthorizationError } from "@/lib/auth";
import { writeAudit, diffFields } from "@/lib/audit";
import {
  rtiSchema,
  rtiFirstAppealSchema,
  rtiSecondAppealSchema,
} from "@/lib/validators";
import { RTI_WRITE_ROLES, RTI_STATUSES } from "@/lib/constants";
import { getDeadlineRules } from "@/lib/settings";
import { computeRtiDeadlines } from "@/lib/rti-deadlines";
import type { ActionState } from "@/lib/actions/contacts";

function genRef(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).slice(-5).toUpperCase()}`;
}

function fieldErrors(error: { issues: { path: (string | number)[]; message: string }[] }) {
  const out: Record<string, string> = {};
  for (const i of error.issues) {
    const k = String(i.path[0] ?? "form");
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

// ── RTI applications ────────────────────────────────────────────────────────

function parseRti(formData: FormData) {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) obj[k] = v;
  // checkboxes: real booleans (z.coerce.boolean treats "false" as true)
  obj.isLifeLiberty = formData.get("isLifeLiberty") === "on" || formData.get("isLifeLiberty") === "true";
  obj.applicationFeePaid = formData.get("applicationFeePaid") === "on" || formData.get("applicationFeePaid") === "true";
  obj.reminderEnabled = formData.get("reminderEnabled") === "on" || formData.get("reminderEnabled") === "true";
  return rtiSchema.safeParse(obj);
}

async function rtiToRow(
  supabase: any,
  input: Record<string, any>,
  deadlines: { normalDue: string | null; lifeLibertyDue: string | null; firstAppealDue: string | null; secondAppealDue: string | null },
) {
  const tags =
    typeof input.tags === "string" && input.tags.trim()
      ? input.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
      : [];

  let divisionId = input.divisionId ?? null;
  let engSubDivisionId = input.engSubDivisionId ?? null;
  let gbaWardId = null;
  let gbaDivision = null;
  let gbaSubdivision = null;
  const wardType = input.wardType || "BBMP";

  if (wardType === "GBA") {
    gbaWardId = input.wardId ?? null;
    gbaDivision = input.divisionId ?? null;
    gbaSubdivision = input.engSubDivisionId ?? null;

    if (gbaDivision) {
      const { data: d } = await supabase
        .from("divisions")
        .select("id")
        .eq("name", gbaDivision)
        .maybeSingle();
      divisionId = d?.id ?? null;
    }
    if (gbaSubdivision) {
      const { data: s } = await supabase
        .from("eng_subdivisions")
        .select("id")
        .eq("name", gbaSubdivision)
        .maybeSingle();
      engSubDivisionId = s?.id ?? null;
    }
  }

  return {
    subject: input.subject,
    info_requested: input.infoRequested ?? null,
    category: input.category ?? null,
    status: input.status,
    priority: input.priority,
    filing_mode: input.filingMode ?? null,
    satisfaction_status: input.satisfactionStatus ?? null,
    applicant_name: input.applicantName ?? null,
    applicant_address: input.applicantAddress ?? null,
    applicant_phone: input.applicantPhone ?? null,
    applicant_email: input.applicantEmail ?? null,
    public_authority: input.publicAuthority ?? null,
    department: input.department ?? null,
    office_address: input.officeAddress ?? null,
    pio_name: input.pioName ?? null,
    pio_designation: input.pioDesignation ?? null,
    pio_phone: input.pioPhone ?? null,
    pio_email: input.pioEmail ?? null,
    faa_name: input.faaName ?? null,
    faa_designation: input.faaDesignation ?? null,
    faa_phone: input.faaPhone ?? null,
    faa_email: input.faaEmail ?? null,
    corporation_id: input.corporationId ?? null,
    division_id: divisionId,
    eng_subdivision_id: engSubDivisionId,
    ward_id: wardType === "BBMP" ? (input.wardId ?? null) : null,
    contact_id: input.contactId ?? null,
    application_fee_paid: input.applicationFeePaid ?? false,
    fee_mode: input.feeMode ?? null,
    postal_receipt_no: input.postalReceiptNo ?? null,
    online_reg_no: input.onlineRegNo ?? null,
    date_drafted: input.dateDrafted ?? null,
    date_filed: input.dateFiled ?? null,
    date_received: input.dateReceived ?? null,
    is_life_liberty: input.isLifeLiberty ?? false,
    reply_date: input.replyDate ?? null,
    reply_summary: input.replySummary ?? null,
    next_action: input.nextAction ?? null,
    next_action_date: input.nextActionDate ?? null,
    reminder_enabled: input.reminderEnabled ?? false,
    tags,
    internal_notes: input.internalNotes ?? null,
    public_notes: input.publicNotes ?? null,
    normal_due: deadlines.normalDue,
    life_liberty_due: deadlines.lifeLibertyDue,
    first_appeal_due: deadlines.firstAppealDue,
    second_appeal_due: deadlines.secondAppealDue,

    // GBA columns
    ward_type: wardType,
    gba_ward_id: gbaWardId,
    gba_division: gbaDivision,
    gba_subdivision: gbaSubdivision,
  };
}

async function deadlinesFor(input: Record<string, any>) {
  const rules = await getDeadlineRules();
  return computeRtiDeadlines(
    {
      dateReceived: input.dateReceived ?? null,
      dateFiled: input.dateFiled ?? null,
      isLifeLiberty: input.isLifeLiberty ?? false,
      replyDate: input.replyDate ?? null,
    },
    rules,
  );
}

export async function createRti(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(RTI_WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const parsed = parseRti(formData);
  if (!parsed.success)
    return { error: "Please fix the errors below.", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const deadlines = await deadlinesFor(parsed.data);
  const row = {
    ...await rtiToRow(supabase, parsed.data, deadlines),
    internal_ref: genRef("RTI"),
    created_by: user.id,
    updated_by: user.id,
  };
  const { data, error } = await supabase
    .from("rti_applications")
    .insert(row)
    .select("id")
    .single();
  if (error) return { error: error.message };

  await writeAudit(supabase, {
    entityType: "rti",
    entityId: data.id,
    changedBy: user.id,
    changes: [{ field: "created", oldValue: null, newValue: parsed.data.subject }],
  });
  revalidatePath("/rti");
  return { success: true, id: data.id };
}

export async function updateRti(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(RTI_WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const parsed = parseRti(formData);
  if (!parsed.success)
    return { error: "Please fix the errors below.", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data: before } = await supabase.from("rti_applications").select("*").eq("id", id).single();
  const deadlines = await deadlinesFor(parsed.data);
  const row = { ...await rtiToRow(supabase, parsed.data, deadlines), updated_by: user.id };
  const { error } = await supabase.from("rti_applications").update(row).eq("id", id);
  if (error) return { error: error.message };

  await writeAudit(supabase, {
    entityType: "rti",
    entityId: id,
    changedBy: user.id,
    changes: diffFields(before ?? null, row),
  });
  revalidatePath(`/rti/${id}`);
  revalidatePath("/rti");
  return { success: true, id };
}

export async function setRtiStatus(id: string, status: string): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(RTI_WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  if (!RTI_STATUSES.includes(status as never)) return { error: "Invalid status" };

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("rti_applications")
    .select("status")
    .eq("id", id)
    .single();
  const { error } = await supabase
    .from("rti_applications")
    .update({ status, updated_by: user.id })
    .eq("id", id);
  if (error) return { error: error.message };

  await writeAudit(supabase, {
    entityType: "rti",
    entityId: id,
    changedBy: user.id,
    changes: [{ field: "status", oldValue: before?.status, newValue: status }],
  });
  revalidatePath(`/rti/${id}`);
  revalidatePath("/rti");
  return { success: true, id };
}

export async function deleteRti(id: string): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(["ADMIN"]);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("rti_applications").delete().eq("id", id);
  if (error) return { error: error.message };
  await writeAudit(supabase, {
    entityType: "rti",
    entityId: id,
    changedBy: user.id,
    changes: [{ field: "deleted", oldValue: id, newValue: null }],
  });
  revalidatePath("/rti");
  return { success: true };
}

// ── First appeals ───────────────────────────────────────────────────────────

function parseFirstAppeal(formData: FormData) {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) obj[k] = v;
  obj.grounds = formData.getAll("grounds");
  return rtiFirstAppealSchema.safeParse(obj);
}

export async function createFirstAppeal(
  rtiId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(RTI_WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const parsed = parseFirstAppeal(formData);
  if (!parsed.success)
    return { error: "Please fix the errors below.", fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;

  const supabase = await createClient();
  const rules = await getDeadlineRules();
  const faaOrderDue = d.dateFiled
    ? // FAA disposal target from filing date
      new Date(new Date(d.dateFiled).getTime() + rules.faaDisposalDays * 86_400_000)
        .toISOString()
        .slice(0, 10)
    : null;

  const row = {
    rti_id: rtiId,
    faa_name: d.faaName ?? null,
    faa_designation: d.faaDesignation ?? null,
    faa_phone: d.faaPhone ?? null,
    faa_email: d.faaEmail ?? null,
    grounds: d.grounds ?? [],
    grounds_detail: d.groundsDetail ?? null,
    date_drafted: d.dateDrafted ?? null,
    date_filed: d.dateFiled ?? null,
    faa_order_due: faaOrderDue,
    faa_order_date: d.faaOrderDate ?? null,
    decision_summary: d.decisionSummary ?? null,
    status: d.dateFiled ? "Filed" : "Draft",
    notes: d.notes ?? null,
    created_by: user.id,
    updated_by: user.id,
  };
  const { data, error } = await supabase
    .from("rti_first_appeals")
    .insert(row)
    .select("id")
    .single();
  if (error) return { error: error.message };

  // Reflect on the parent RTI: bump status and recompute the second-appeal clock.
  const newStatus = d.dateFiled ? "First Appeal Filed" : "First Appeal Drafted";
  const rtiUpdate: Record<string, unknown> = { status: newStatus, updated_by: user.id };
  if (d.faaOrderDate) {
    const secondAppealDue = computeRtiDeadlines(
      { firstAppealDecisionDate: d.faaOrderDate },
      rules,
    ).secondAppealDue;
    rtiUpdate.second_appeal_due = secondAppealDue;
    rtiUpdate.status = "FAA Order Received";
  }
  await supabase.from("rti_applications").update(rtiUpdate).eq("id", rtiId);

  await writeAudit(supabase, {
    entityType: "rti_first_appeal",
    entityId: data.id,
    changedBy: user.id,
    changes: [{ field: "created", oldValue: null, newValue: rtiId }],
  });
  revalidatePath(`/rti/${rtiId}`);
  revalidatePath("/rti");
  return { success: true, id: rtiId };
}

// ── Second appeals ──────────────────────────────────────────────────────────

function parseSecondAppeal(formData: FormData) {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) obj[k] = v;
  obj.reason = formData.getAll("reason");
  return rtiSecondAppealSchema.safeParse(obj);
}

export async function createSecondAppeal(
  rtiId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(RTI_WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const parsed = parseSecondAppeal(formData);
  if (!parsed.success)
    return { error: "Please fix the errors below.", fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;

  const supabase = await createClient();
  const row = {
    rti_id: rtiId,
    first_appeal_id: d.firstAppealId ?? null,
    commission_name: d.commissionName ?? null,
    reason: d.reason ?? [],
    reason_detail: d.reasonDetail ?? null,
    filing_date: d.filingDate ?? null,
    diary_number: d.diaryNumber ?? null,
    hearing_date: d.hearingDate ?? null,
    hearing_status: d.hearingStatus ?? null,
    order_date: d.orderDate ?? null,
    order_summary: d.orderSummary ?? null,
    compliance_due_date: d.complianceDueDate ?? null,
    compliance_status: d.complianceStatus ?? null,
    status: d.filingDate ? "Filed" : "Draft",
    notes: d.notes ?? null,
    created_by: user.id,
    updated_by: user.id,
  };
  const { data, error } = await supabase
    .from("rti_second_appeals")
    .insert(row)
    .select("id")
    .single();
  if (error) return { error: error.message };

  await supabase
    .from("rti_applications")
    .update({ status: d.filingDate ? "Second Appeal Filed" : "Second Appeal Drafted", updated_by: user.id })
    .eq("id", rtiId);

  await writeAudit(supabase, {
    entityType: "rti_second_appeal",
    entityId: data.id,
    changedBy: user.id,
    changes: [{ field: "created", oldValue: null, newValue: rtiId }],
  });
  revalidatePath(`/rti/${rtiId}`);
  revalidatePath("/rti");
  return { success: true, id: rtiId };
}
