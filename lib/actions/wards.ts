"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole, AuthorizationError } from "@/lib/auth";
import { writeAudit, diffFields } from "@/lib/audit";
import { wardEditSchema } from "@/lib/validators";
import { WRITE_ROLES, VERIFY_ROLES, VERIFICATION_STATUSES } from "@/lib/constants";
import type { ActionState } from "@/lib/actions/contacts";

export async function updateWard(
  newNo: number,
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
  const parsed = wardEditSchema.safeParse(obj);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Please fix the errors below.", fieldErrors };
  }

  const supabase = await createClient();
  const { data: before } = await supabase.from("wards").select("*").eq("new_no", newNo).single();
  const row = {
    new_name: parsed.data.newName,
    property_count: parsed.data.propertyCount ?? null,
    zone: parsed.data.zone ?? null,
    notes: parsed.data.notes ?? null,
    verification_status: parsed.data.verificationStatus,
    confidence_score: parsed.data.confidenceScore,
  };
  const { error } = await supabase.from("wards").update(row).eq("new_no", newNo);
  if (error) return { error: error.message };

  await writeAudit(supabase, {
    entityType: "ward",
    entityId: before?.id ?? String(newNo),
    changedBy: user.id,
    changes: diffFields(before ?? null, row),
  });
  revalidatePath(`/wards/${newNo}`);
  revalidatePath("/wards");
  return { success: true };
}

export async function setWardVerification(
  newNo: number,
  status: string,
): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(VERIFY_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  if (!VERIFICATION_STATUSES.includes(status as never)) return { error: "Invalid status" };

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("wards")
    .select("id, verification_status")
    .eq("new_no", newNo)
    .single();
  const { error } = await supabase
    .from("wards")
    .update({ verification_status: status })
    .eq("new_no", newNo);
  if (error) return { error: error.message };

  await writeAudit(supabase, {
    entityType: "ward",
    entityId: before?.id ?? String(newNo),
    changedBy: user.id,
    changes: [{ field: "verification_status", oldValue: before?.verification_status, newValue: status }],
  });
  revalidatePath(`/wards/${newNo}`);
  return { success: true };
}
