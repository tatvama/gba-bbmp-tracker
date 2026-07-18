"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole, AuthorizationError } from "@/lib/auth";
import { writeAudit, diffFields } from "@/lib/audit";
import { contactSchema, contactJurisdictionInputSchema, type ContactJurisdictionInput } from "@/lib/validators";
import { WRITE_ROLES, VERIFY_ROLES, VERIFICATION_STATUSES } from "@/lib/constants";

export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
  id?: string;
}

/** Map validated camelCase input → snake_case DB columns. */
function toRow(input: Record<string, any>) {
  return {
    full_name: input.fullName,
    designation: input.designation,
    department: input.department ?? null,
    corporation_id: input.corporationId ?? null,
    division_id: input.divisionId ?? null,
    eng_subdivision_id: input.engSubDivisionId ?? null,
    office_address: input.officeAddress ?? null,
    phone: input.phone ?? null,
    whatsapp: input.whatsapp ?? null,
    email: input.email ?? null,
    office_timing: input.officeTiming ?? null,
    jurisdiction_notes: input.jurisdictionNotes ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    source: input.source ?? null,
    source_page: input.sourcePage ?? null,
    verification_status: input.verificationStatus,
    confidence_score: input.confidenceScore,
    public_notes: input.publicNotes ?? null,
    internal_notes: input.internalNotes ?? null,
    // Master-directory upgrade (0044). not-null columns get their default when
    // the field is absent; checkbox booleans rely on a hidden "false" companion
    // input in the form so an unchecked box submits false, not undefined.
    official_title: input.officialTitle ?? null,
    office_name: input.officeName ?? null,
    letter_salutation: input.letterSalutation ?? null,
    designation_category: input.designationCategory ?? null,
    office_type: input.officeType ?? null,
    zone: input.zone ?? null,
    employee_code: input.employeeCode ?? null,
    officer_status: input.officerStatus ?? "Active",
    can_receive_complaint: input.canReceiveComplaint ?? true,
    can_receive_rti: input.canReceiveRti ?? true,
    can_receive_appeal: input.canReceiveAppeal ?? true,
    can_receive_legal_notice: input.canReceiveLegalNotice ?? true,
    can_receive_tvcc_notice: input.canReceiveTvccNotice ?? false,
  };
}

/** Replace a contact's ward jurisdictions from the form's hidden JSON input.
 *  Absent field → leave existing untouched; present (even "[]") → replace-all,
 *  so the form round-trips the full set (getContact seeds the editor on edit). */
async function syncContactJurisdictions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contactId: string,
  raw: FormDataEntryValue | null,
): Promise<void> {
  if (raw == null || typeof raw !== "string") return; // field not submitted → don't touch
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "[]");
  } catch {
    return; // malformed → leave existing jurisdictions intact
  }
  if (!Array.isArray(parsed)) return;

  const rows = parsed
    .map((r) => contactJurisdictionInputSchema.safeParse(r))
    .filter((r): r is { success: true; data: ContactJurisdictionInput } => r.success)
    .map((r) => r.data)
    .filter((r) => r.wardNo != null || r.wardId); // must identify a ward

  await supabase.from("contact_jurisdictions").delete().eq("contact_id", contactId);
  if (!rows.length) return;
  await supabase.from("contact_jurisdictions").insert(
    rows.map((r, i) => ({
      contact_id: contactId,
      ward_id: r.wardId ?? null,
      ward_no: r.wardNo ?? null,
      ward_name: r.wardName ?? null,
      zone: r.zone ?? null,
      aro_office_division: r.aroOfficeDivision ?? null,
      jurisdiction_type: "ward",
      is_primary: r.isPrimary ?? i === 0,
    })),
  );
}

function parseForm(formData: FormData) {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) obj[k] = v;
  return contactSchema.safeParse(obj);
}

export async function createContact(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const row = { ...toRow(parsed.data), created_by: user.id, updated_by: user.id };
  const { data, error } = await supabase.from("contacts").insert(row).select("id").single();
  if (error) return { error: error.message };

  await syncContactJurisdictions(supabase, data.id, formData.get("wardJurisdictions"));
  await writeAudit(supabase, {
    entityType: "contact",
    entityId: data.id,
    changedBy: user.id,
    changes: [{ field: "created", oldValue: null, newValue: parsed.data.fullName }],
  });
  revalidatePath("/contacts");
  return { success: true, id: data.id };
}

export async function updateContact(
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
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const { data: before } = await supabase.from("contacts").select("*").eq("id", id).single();
  const row = { ...toRow(parsed.data), updated_by: user.id };
  const { error } = await supabase.from("contacts").update(row).eq("id", id);
  if (error) return { error: error.message };

  await syncContactJurisdictions(supabase, id, formData.get("wardJurisdictions"));
  await writeAudit(supabase, {
    entityType: "contact",
    entityId: id,
    changedBy: user.id,
    changes: diffFields(before ?? null, row),
  });
  revalidatePath(`/contacts/${id}`);
  revalidatePath("/contacts");
  return { success: true, id };
}

export async function setContactVerification(
  contactId: string,
  status: string,
  note?: string,
): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(VERIFY_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  if (!VERIFICATION_STATUSES.includes(status as never)) {
    return { error: "Invalid verification status" };
  }

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("contacts")
    .select("verification_status, internal_notes")
    .eq("id", contactId)
    .single();

  const update: Record<string, unknown> = {
    verification_status: status,
    last_verified_date: status === "VERIFIED" ? new Date().toISOString().slice(0, 10) : null,
    updated_by: user.id,
  };
  if (note && note.trim()) {
    const prevNotes = (before?.internal_notes as string) ?? "";
    update.internal_notes = `${prevNotes}\n[${new Date().toISOString().slice(0, 10)}] ${note.trim()}`.trim();
  }

  const { error } = await supabase.from("contacts").update(update).eq("id", contactId);
  if (error) return { error: error.message };

  await writeAudit(supabase, {
    entityType: "contact",
    entityId: contactId,
    changedBy: user.id,
    changes: [
      { field: "verification_status", oldValue: before?.verification_status, newValue: status },
    ],
  });
  revalidatePath(`/contacts/${contactId}`);
  return { success: true, id: contactId };
}

export async function deleteContact(id: string): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(["ADMIN"]);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  if (error) return { error: error.message };
  await writeAudit(supabase, {
    entityType: "contact",
    entityId: id,
    changedBy: user.id,
    changes: [{ field: "deleted", oldValue: id, newValue: null }],
  });
  revalidatePath("/contacts");
  return { success: true };
}

function zodToFieldErrors(error: { issues: { path: (string | number)[]; message: string }[] }) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
