"use server";

import { revalidatePath } from "next/cache";
import { requireRole, AuthorizationError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";
import { triggerAdvisorAnalysis } from "@/lib/actions/ai-advisor";

/**
 * Print-pipeline actions for drafted complaint letters. Printing is the first
 * physical step of the cycle: pending → printed (stamped who + when) → the
 * submission itself is then recorded by fileComplaint (hand/post/RPAD + ref),
 * which files the complaint and the normal lifecycle continues.
 */

interface PrintActionResult {
  success?: boolean;
  error?: string;
}

function fail(e: unknown): PrintActionResult {
  return { error: e instanceof AuthorizationError ? e.message : e instanceof Error ? e.message : "Action failed" };
}

async function loadLetter(admin: ReturnType<typeof createAdminClient>, letterId: string) {
  const { data } = await admin
    .from("letter_drafts")
    .select("id, complaint_id, job_number, print_status, file_name")
    .eq("id", letterId)
    .maybeSingle();
  return data as { id: string; complaint_id: string | null; job_number: string | null; print_status: string; file_name: string | null } | null;
}

function revalidatePrintPaths(complaintId: string | null) {
  revalidatePath("/complaints/print-queue");
  revalidatePath("/complaints/dashboard");
  if (complaintId) revalidatePath(`/complaints/${complaintId}`);
}

/** Stamp a letter as PRINTED (date/time + user) and log it on the case. */
export async function markLetterPrintedAction(letterId: string): Promise<PrintActionResult> {
  let user;
  try {
    user = await requireRole(COMPLAINT_FIELD_ROLES);
  } catch (e) {
    return fail(e);
  }
  const admin = createAdminClient();
  const letter = await loadLetter(admin, letterId);
  if (!letter) return { error: "Letter not found." };
  if (letter.print_status === "printed") return { success: true }; // double-click safe

  const printedAt = new Date().toISOString();
  const { error } = await admin
    .from("letter_drafts")
    .update({ print_status: "printed", printed_at: printedAt, printed_by: user.id })
    .eq("id", letterId);
  if (error) return { error: error.message };

  const who = user.profile?.name || user.email || "user";
  if (letter.complaint_id) {
    await admin.from("complaint_timeline").insert({
      complaint_id: letter.complaint_id,
      event_type: "Note",
      title: "Complaint letter printed",
      summary: `${letter.file_name || "Drafted letter"} printed by ${who}. Next: submit it and record how it went out.`,
      created_by: user.id,
    });
    void triggerAdvisorAnalysis(letter.complaint_id);
  }
  revalidatePrintPaths(letter.complaint_id);
  return { success: true };
}

/** Undo a mistaken "printed" click — the letter returns to the print queue. */
export async function undoLetterPrintedAction(letterId: string): Promise<PrintActionResult> {
  let user;
  try {
    user = await requireRole(COMPLAINT_FIELD_ROLES);
  } catch (e) {
    return fail(e);
  }
  const admin = createAdminClient();
  const letter = await loadLetter(admin, letterId);
  if (!letter) return { error: "Letter not found." };
  if (letter.print_status !== "printed") return { success: true };

  const { error } = await admin
    .from("letter_drafts")
    .update({ print_status: "pending", printed_at: null, printed_by: null })
    .eq("id", letterId);
  if (error) return { error: error.message };

  if (letter.complaint_id) {
    await admin.from("complaint_timeline").insert({
      complaint_id: letter.complaint_id,
      event_type: "Note",
      title: "Letter print record undone",
      summary: `Print record removed by ${user.profile?.name || user.email || "user"} — the letter is back in the print queue.`,
      created_by: user.id,
    });
  }
  revalidatePrintPaths(letter.complaint_id);
  return { success: true };
}

/**
 * Put a letter (back) into the print queue — used for reprints after a
 * revision, or to queue a manually drafted letter.
 */
export async function queueLetterForPrintAction(letterId: string): Promise<PrintActionResult> {
  let user;
  try {
    user = await requireRole(COMPLAINT_FIELD_ROLES);
  } catch (e) {
    return fail(e);
  }
  const admin = createAdminClient();
  const letter = await loadLetter(admin, letterId);
  if (!letter) return { error: "Letter not found." };
  if (letter.print_status === "pending") return { success: true };

  const { error } = await admin
    .from("letter_drafts")
    .update({ print_status: "pending", printed_at: null, printed_by: null })
    .eq("id", letterId);
  if (error) return { error: error.message };

  if (letter.complaint_id) {
    await admin.from("complaint_timeline").insert({
      complaint_id: letter.complaint_id,
      event_type: "Note",
      title: "Letter queued for printing",
      summary: `${letter.file_name || "Drafted letter"} added to the print queue by ${user.profile?.name || user.email || "user"}.`,
      created_by: user.id,
    });
  }
  revalidatePrintPaths(letter.complaint_id);
  return { success: true };
}
