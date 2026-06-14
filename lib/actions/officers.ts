"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole, AuthorizationError } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { officerTransferSchema } from "@/lib/validators";
import { WRITE_ROLES } from "@/lib/constants";
import type { ActionState } from "@/lib/actions/contacts";

function fieldErrors(error: { issues: { path: (string | number)[]; message: string }[] }) {
  const out: Record<string, string> = {};
  for (const i of error.issues) {
    const k = String(i.path[0] ?? "form");
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

/**
 * Record a transfer in an officer's posting history. Also updates the officer's
 * current posting summary on the contact row so "currently in charge" stays live.
 */
export async function addOfficerTransfer(
  officerId: string,
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
  const parsed = officerTransferSchema.safeParse(obj);
  if (!parsed.success)
    return { error: "Please fix the errors below.", fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("officer_transfers")
    .insert({
      officer_id: officerId,
      prev_corporation: d.prevCorporation ?? null,
      prev_division: d.prevDivision ?? null,
      prev_subdivision: d.prevSubdivision ?? null,
      prev_ward: d.prevWard ?? null,
      new_corporation: d.newCorporation ?? null,
      new_division: d.newDivision ?? null,
      new_subdivision: d.newSubdivision ?? null,
      new_ward: d.newWard ?? null,
      transfer_order_no: d.transferOrderNo ?? null,
      transfer_order_date: d.transferOrderDate ?? null,
      effective_date: d.effectiveDate ?? null,
      source_document: d.sourceDocument ?? null,
      notes: d.notes ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  // Reflect the new posting on the contact (best-effort).
  const posting = [d.newCorporation, d.newDivision, d.newSubdivision, d.newWard]
    .filter(Boolean)
    .join(" / ");
  if (posting || d.effectiveDate) {
    await supabase
      .from("contacts")
      .update({
        transfer_status: "Transferred",
        current_posting_start: d.effectiveDate ?? null,
        updated_by: user.id,
      })
      .eq("id", officerId);
  }

  await writeAudit(supabase, {
    entityType: "officer",
    entityId: officerId,
    changedBy: user.id,
    changes: [{ field: "transfer_added", oldValue: null, newValue: posting || (d.effectiveDate ?? "transfer") }],
  });
  revalidatePath(`/officers/${officerId}`);
  revalidatePath("/officers");
  return { success: true, id: data.id };
}
