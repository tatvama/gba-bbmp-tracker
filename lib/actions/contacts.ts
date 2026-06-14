"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole, AuthorizationError } from "@/lib/auth";
import { writeAudit, diffFields } from "@/lib/audit";
import { contactSchema } from "@/lib/validators";
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
  };
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
