"use server";

import { revalidatePath } from "next/cache";
import { requireRole, AuthorizationError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";

/**
 * Admin actions for the escalation ladder's process-flow page
 * (/complaints/process-flow). escalation_flow_configs (migration 0031) is the
 * single source of truth the scheduler reads (lib/complaints/escalation-scheduler.ts)
 * — editing sla_days/sla_unit/on_elapse_draft_kind here changes the ladder's
 * real behavior, not just the diagram. position_x/position_y are purely
 * cosmetic (where the node sits on the canvas).
 */

interface FlowActionResult {
  success?: boolean;
  error?: string;
}

function fail(e: unknown): FlowActionResult {
  return { error: e instanceof AuthorizationError ? e.message : e instanceof Error ? e.message : "Action failed" };
}

/** Persist a node's dragged position on the canvas. Cosmetic only. */
export async function updateEscalationFlowPositionAction(
  stageKey: string,
  positionX: number,
  positionY: number,
): Promise<FlowActionResult> {
  try {
    await requireRole(COMPLAINT_FIELD_ROLES);
  } catch (e) {
    return fail(e);
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("escalation_flow_configs")
    .update({ position_x: positionX, position_y: positionY })
    .eq("stage_key", stageKey);
  if (error) return { error: error.message };
  revalidatePath("/complaints/process-flow");
  return { success: true };
}

/** Edit a stage's SLA / draft kind / label — changes the scheduler's real behavior. */
export async function updateEscalationFlowConfigAction(
  stageKey: string,
  patch: { label?: string; slaDays?: number | null; slaUnit?: "calendar" | "working" | null; onElapseDraftKind?: string | null },
): Promise<FlowActionResult> {
  try {
    await requireRole(["ADMIN"]);
  } catch (e) {
    return fail(e);
  }
  const admin = createAdminClient();
  const update: Record<string, unknown> = {};
  if (patch.label !== undefined) update.label = patch.label;
  if (patch.slaDays !== undefined) update.sla_days = patch.slaDays;
  if (patch.slaUnit !== undefined) update.sla_unit = patch.slaUnit;
  if (patch.onElapseDraftKind !== undefined) update.on_elapse_draft_kind = patch.onElapseDraftKind || null;
  if (!Object.keys(update).length) return { success: true };

  const { error } = await admin.from("escalation_flow_configs").update(update).eq("stage_key", stageKey);
  if (error) return { error: error.message };
  revalidatePath("/complaints/process-flow");
  return { success: true };
}
