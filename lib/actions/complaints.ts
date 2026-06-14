"use server";

import { revalidatePath } from "next/cache";
import { requireRole, getSessionUser, AuthorizationError, type SessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSignedUrl } from "@/lib/storage/supabase-upload";
import { writeAudit, diffFields } from "@/lib/audit";
import {
  complaintSchema,
  complaintReplySchema,
  complaintActionTakenSchema,
  communicationLogSchema,
  applyExtractionSchema,
} from "@/lib/validators";
import {
  COMPLAINT_WRITE_ROLES,
  COMPLAINT_VERIFY_ROLES,
  type UserRole,
} from "@/lib/constants";
import { getComplaintSettings } from "@/lib/settings";
import { addDays } from "@/lib/rti-deadlines";
import { generateText } from "@/lib/ai/provider";
import {
  buildComplaintDraftPrompt,
  type ComplaintDraftKind,
} from "@/lib/ai/complaint-document-analyzer";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DraftLanguage, LegalTone } from "@/lib/constants";

export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
  id?: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

function fieldErrors(error: { issues: { path: (string | number)[]; message: string }[] }) {
  const out: Record<string, string> = {};
  for (const i of error.issues) {
    const k = String(i.path[0] ?? "form");
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

/** Authorize + get the service-role client (server-only). App-level role checks
 *  gate every write; the service-role client performs the multi-table writes so
 *  the full role matrix (incl. Field Officer / Verifier) works without RLS friction. */
async function authed(
  roles: UserRole[],
): Promise<{ user: SessionUser; admin: SupabaseClient } | { error: string }> {
  let user: SessionUser;
  try {
    user = await requireRole(roles);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  try {
    return { user, admin: createAdminClient() };
  } catch {
    return { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY — required for complaint writes/uploads." };
  }
}

async function addTimeline(
  admin: SupabaseClient,
  e: {
    complaintId: string;
    eventType: string;
    title: string;
    summary?: string | null;
    eventDate?: string;
    relatedDocumentId?: string | null;
    relatedOfficerId?: string | null;
    createdBy: string;
  },
) {
  await admin.from("complaint_timeline").insert({
    complaint_id: e.complaintId,
    event_type: e.eventType,
    event_date: e.eventDate ?? new Date().toISOString(),
    title: e.title,
    summary: e.summary ?? null,
    related_document_id: e.relatedDocumentId ?? null,
    related_officer_id: e.relatedOfficerId ?? null,
    created_by: e.createdBy,
  });
}

async function addReminder(
  admin: SupabaseClient,
  r: { complaintId: string; title: string; dueDate: string; reminderType: string; createdBy: string; priority?: string },
) {
  await admin.from("reminders").insert({
    entity_type: "complaint",
    entity_id: r.complaintId,
    title: r.title,
    due_date: r.dueDate,
    reminder_type: r.reminderType,
    priority: r.priority ?? "Medium",
    status: "Pending",
    channels: ["In-app"],
    created_by: r.createdBy,
  });
}

function parse(formData: FormData) {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) obj[k] = v;
  obj.reminderEnabled = formData.get("reminderEnabled") === "on" || formData.get("reminderEnabled") === "true";
  return complaintSchema.safeParse(obj);
}

function toRow(input: Record<string, any>) {
  return {
    title: input.title,
    type: input.type,
    status: input.status,
    priority: input.priority ?? null,
    complaint_subtype: input.complaintSubtype ?? null,
    public_impact: input.publicImpact ?? null,
    complaint_number: input.externalComplaintNumber ?? null,
    rti_number: input.rtiNumber ?? null,
    complaint_mode: input.complaintFiledMode ?? null,
    complaint_filed_to: input.complaintFiledTo ?? null,
    complaint_filed_by: input.complaintFiledBy ?? null,
    date_submitted: input.complaintGivenDate ?? null,
    acknowledgment_date: input.acknowledgementDate ?? null,
    expected_resolution_date: input.expectedResolutionDate ?? null,
    corporation_id: input.corporationId ?? null,
    division_id: input.divisionId ?? null,
    ward_id: input.wardId ?? null,
    eng_subdivision_id: input.engSubDivisionId ?? null,
    assigned_engineer_id: input.assignedEngineerId ?? null,
    assigned_officer_id: input.assignedOfficerId ?? null,
    responsible_department: input.responsibleDepartment ?? null,
    location: input.locationText ?? null,
    landmark: input.landmark ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    description: input.description ?? null,
    requested_action: input.requestedAction ?? null,
    next_follow_up_date: input.nextFollowUpDate ?? null,
    next_action_date: input.nextFollowUpDate ?? null,
    reminder_flag: input.reminderEnabled ?? false,
    notes: input.notes ?? null,
  };
}

// ── Create / update / delete ────────────────────────────────────────────────

export async function createComplaint(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await authed(COMPLAINT_WRITE_ROLES);
  if ("error" in a) return { error: a.error };
  const { user, admin } = a;

  const parsed = parse(formData);
  if (!parsed.success) return { error: "Please fix the errors below.", fieldErrors: fieldErrors(parsed.error) };

  const settings = await getComplaintSettings();
  const year = new Date().getFullYear();
  const { data: rpc, error: rpcError } = await admin.rpc("next_complaint_case_number", {
    p_prefix: settings.caseNumberPrefix || "DM-CMP",
    p_year: year,
  });
  if (rpcError || !rpc) {
    return { error: `Could not generate a case number: ${rpcError?.message ?? "unknown error"}` };
  }
  const caseNumber = rpc as string;

  const row: Record<string, unknown> = {
    ...toRow(parsed.data),
    internal_case_number: caseNumber,
    created_by: user.id,
    updated_by: user.id,
  };

  // Auto follow-up after filing.
  if (parsed.data.reminderEnabled && !parsed.data.nextFollowUpDate) {
    const due = addDays(todayISO(), settings.followUpDaysAfterFiling);
    if (due) {
      row.next_follow_up_date = due;
      row.next_action_date = due;
    }
  }

  const { data, error } = await admin.from("complaints").insert(row).select("id").single();
  if (error) return { error: error.message };
  const id = data.id as string;

  await addTimeline(admin, {
    complaintId: id,
    eventType: "Created",
    title: "Complaint created",
    summary: `${caseNumber ?? ""} — ${parsed.data.title}`.trim(),
    createdBy: user.id,
  });
  if (parsed.data.status !== "Draft") {
    await addTimeline(admin, { complaintId: id, eventType: "Filed", title: `Status: ${parsed.data.status}`, createdBy: user.id });
  }
  if (row.next_follow_up_date) {
    await addReminder(admin, {
      complaintId: id,
      title: `Follow up: ${parsed.data.title}`,
      dueDate: row.next_follow_up_date as string,
      reminderType: "Follow-up with engineer",
      createdBy: user.id,
      priority: parsed.data.priority ?? "Medium",
    });
  }
  await writeAudit(admin, {
    entityType: "complaint", entityId: id, changedBy: user.id,
    changes: [{ field: "created", oldValue: null, newValue: caseNumber ?? parsed.data.title }],
  });
  revalidatePath("/complaints");
  return { success: true, id };
}

export async function updateComplaint(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await authed(COMPLAINT_WRITE_ROLES);
  if ("error" in a) return { error: a.error };
  const { user, admin } = a;

  const parsed = parse(formData);
  if (!parsed.success) return { error: "Please fix the errors below.", fieldErrors: fieldErrors(parsed.error) };

  const { data: before } = await admin.from("complaints").select("*").eq("id", id).single();
  const row = { ...toRow(parsed.data), updated_by: user.id };
  const { error } = await admin.from("complaints").update(row).eq("id", id);
  if (error) return { error: error.message };

  if (before && before.status !== parsed.data.status) {
    await addTimeline(admin, { complaintId: id, eventType: "Status Change", title: `Status → ${parsed.data.status}`, createdBy: user.id });
  }
  await writeAudit(admin, { entityType: "complaint", entityId: id, changedBy: user.id, changes: diffFields(before ?? null, row) });
  revalidatePath(`/complaints/${id}`);
  revalidatePath("/complaints");
  return { success: true, id };
}

export async function deleteComplaint(id: string): Promise<ActionState> {
  const a = await authed(["ADMIN", "COMPLAINT_MANAGER"]);
  if ("error" in a) return { error: a.error };
  const { user, admin } = a;
  const { error } = await admin.from("complaints").update({ deleted_at: new Date().toISOString(), updated_by: user.id }).eq("id", id);
  if (error) return { error: error.message };
  await writeAudit(admin, { entityType: "complaint", entityId: id, changedBy: user.id, changes: [{ field: "deleted", oldValue: id, newValue: null }] });
  revalidatePath("/complaints");
  return { success: true };
}

export async function setComplaintStatus(id: string, status: string): Promise<ActionState> {
  const a = await authed(COMPLAINT_WRITE_ROLES);
  if ("error" in a) return { error: a.error };
  const { user, admin } = a;
  const { data: before } = await admin.from("complaints").select("status").eq("id", id).single();
  const update: Record<string, unknown> = { status, updated_by: user.id };
  if (status === "Closed" || status === "Resolved") update.closure_date = todayISO();
  const { error } = await admin.from("complaints").update(update).eq("id", id);
  if (error) return { error: error.message };
  await addTimeline(admin, { complaintId: id, eventType: status === "Closed" ? "Closure" : "Status Change", title: `Status → ${status}`, createdBy: user.id });
  await writeAudit(admin, { entityType: "complaint", entityId: id, changedBy: user.id, changes: [{ field: "status", oldValue: before?.status, newValue: status }] });
  revalidatePath(`/complaints/${id}`);
  revalidatePath("/complaints");
  return { success: true, id };
}

// ── Replies ─────────────────────────────────────────────────────────────────

export async function addComplaintReply(complaintId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await authed(COMPLAINT_WRITE_ROLES);
  if ("error" in a) return { error: a.error };
  const { user, admin } = a;
  const obj: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) obj[k] = v;
  obj.isSatisfactory = formData.get("isSatisfactory") === "on" || formData.get("isSatisfactory") === "true";
  const parsed = complaintReplySchema.safeParse(obj);
  if (!parsed.success) return { error: "Please fix the errors below.", fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;

  const { error } = await admin.from("complaint_replies").insert({
    complaint_id: complaintId,
    reply_date: d.replyDate ?? null,
    reply_received_date: d.replyReceivedDate ?? null,
    replied_by_name: d.repliedByName ?? null,
    replied_by_designation: d.repliedByDesignation ?? null,
    department: d.department ?? null,
    reply_mode: d.replyMode ?? null,
    reply_summary: d.replySummary ?? null,
    reply_full_text: d.replyFullText ?? null,
    document_id: d.documentId ?? null,
    is_satisfactory: d.isSatisfactory ?? null,
    issues_remaining: d.issuesRemaining ?? null,
    next_action_suggested: d.nextActionSuggested ?? null,
    created_by: user.id,
  });
  if (error) return { error: error.message };

  const settings = await getComplaintSettings();
  const followUp = d.isSatisfactory ? null : addDays(todayISO(), settings.followUpDaysAfterReply);
  const update: Record<string, unknown> = {
    latest_reply_summary: d.replySummary ?? null,
    latest_reply_date: d.replyDate ?? d.replyReceivedDate ?? todayISO(),
    status: "Reply Received",
    updated_by: user.id,
  };
  if (followUp) { update.next_follow_up_date = followUp; update.next_action_date = followUp; }
  await admin.from("complaints").update(update).eq("id", complaintId);

  await addTimeline(admin, { complaintId, eventType: "Reply Received", title: "Reply received", summary: d.replySummary ?? null, createdBy: user.id, relatedDocumentId: d.documentId ?? null });
  if (followUp) await addReminder(admin, { complaintId, title: "Follow up — issues remain after reply", dueDate: followUp, reminderType: "Follow-up with engineer", createdBy: user.id });
  await writeAudit(admin, { entityType: "complaint", entityId: complaintId, changedBy: user.id, changes: [{ field: "reply", oldValue: null, newValue: d.replySummary ?? "reply added" }] });
  revalidatePath(`/complaints/${complaintId}`);
  return { success: true, id: complaintId };
}

// ── Action taken ────────────────────────────────────────────────────────────

export async function addComplaintActionTaken(complaintId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await authed(COMPLAINT_WRITE_ROLES);
  if ("error" in a) return { error: a.error };
  const { user, admin } = a;
  const obj: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) obj[k] = v;
  for (const b of ["workCompleted", "siteVisited", "photoEvidenceAvailable"]) {
    obj[b] = formData.get(b) === "on" || formData.get(b) === "true";
  }
  const parsed = complaintActionTakenSchema.safeParse(obj);
  if (!parsed.success) return { error: "Please fix the errors below.", fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;

  const { error } = await admin.from("complaint_action_taken").insert({
    complaint_id: complaintId,
    action_taken_date: d.actionTakenDate ?? null,
    action_reported_date: d.actionReportedDate ?? null,
    action_taken_by_name: d.actionTakenByName ?? null,
    action_taken_by_designation: d.actionTakenByDesignation ?? null,
    department: d.department ?? null,
    action_summary: d.actionSummary ?? null,
    action_details: d.actionDetails ?? null,
    work_completed: d.workCompleted ?? null,
    site_visited: d.siteVisited ?? null,
    photo_evidence_available: d.photoEvidenceAvailable ?? null,
    document_id: d.documentId ?? null,
    user_satisfaction: d.userSatisfaction ?? null,
    pending_work: d.pendingWork ?? null,
    next_action_required: d.nextActionRequired ?? null,
    created_by: user.id,
  });
  if (error) return { error: error.message };

  const settings = await getComplaintSettings();
  const verify = addDays(todayISO(), settings.siteVerificationDaysAfterAction);
  const update: Record<string, unknown> = {
    latest_action_taken_summary: d.actionSummary ?? null,
    latest_action_taken_date: d.actionTakenDate ?? d.actionReportedDate ?? todayISO(),
    status: "Action Taken Report Received",
    updated_by: user.id,
  };
  if (verify) { update.next_follow_up_date = verify; update.next_action_date = verify; }
  await admin.from("complaints").update(update).eq("id", complaintId);

  await addTimeline(admin, { complaintId, eventType: "Action Taken", title: "Action taken report", summary: d.actionSummary ?? null, createdBy: user.id, relatedDocumentId: d.documentId ?? null });
  if (verify) await addReminder(admin, { complaintId, title: "Verify site action", dueDate: verify, reminderType: "Verify site action", createdBy: user.id });
  await writeAudit(admin, { entityType: "complaint", entityId: complaintId, changedBy: user.id, changes: [{ field: "action_taken", oldValue: null, newValue: d.actionSummary ?? "action added" }] });
  revalidatePath(`/complaints/${complaintId}`);
  return { success: true, id: complaintId };
}

// ── Communication log ───────────────────────────────────────────────────────

export async function addComplaintCommunication(complaintId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await authed([...COMPLAINT_WRITE_ROLES, "FIELD_OFFICER"]);
  if ("error" in a) return { error: a.error };
  const { user, admin } = a;
  const obj: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) obj[k] = v;
  const parsed = communicationLogSchema.safeParse(obj);
  if (!parsed.success) return { error: "Please fix the errors below.", fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;

  const { error } = await admin.from("communication_logs").insert({
    entity_type: "complaint",
    entity_id: complaintId,
    comm_type: d.communicationType,
    occurred_at: d.communicationDate ? new Date(d.communicationDate).toISOString() : new Date().toISOString(),
    officer_id: d.officerId ?? null,
    contact_person: d.contactPerson ?? null,
    phone_or_email: d.phoneOrEmail ?? null,
    summary: d.summary ?? null,
    outcome: d.outcome ?? null,
    next_action: d.nextAction ?? null,
    next_action_date: d.nextActionDate ?? null,
    document_id: d.documentId ?? null,
    created_by: user.id,
  });
  if (error) return { error: error.message };

  await addTimeline(admin, { complaintId, eventType: "Note", title: `${d.communicationType}${d.contactPerson ? ` · ${d.contactPerson}` : ""}`, summary: d.summary ?? null, createdBy: user.id, relatedOfficerId: d.officerId ?? null });
  if (d.nextActionDate) await addReminder(admin, { complaintId, title: d.nextAction || "Follow up", dueDate: d.nextActionDate, reminderType: "Follow-up with engineer", createdBy: user.id });
  await writeAudit(admin, { entityType: "complaint", entityId: complaintId, changedBy: user.id, changes: [{ field: "communication", oldValue: null, newValue: d.communicationType }] });
  revalidatePath(`/complaints/${complaintId}`);
  return { success: true, id: complaintId };
}

// ── Reminders ───────────────────────────────────────────────────────────────

export async function completeComplaintReminder(reminderId: string, complaintId: string): Promise<ActionState> {
  const a = await authed([...COMPLAINT_WRITE_ROLES, "FIELD_OFFICER"]);
  if ("error" in a) return { error: a.error };
  const { user, admin } = a;
  const { error } = await admin.from("reminders").update({ status: "Completed" }).eq("id", reminderId);
  if (error) return { error: error.message };
  await addTimeline(admin, { complaintId, eventType: "Reminder", title: "Reminder completed", createdBy: user.id });
  await writeAudit(admin, { entityType: "complaint", entityId: complaintId, changedBy: user.id, changes: [{ field: "reminder", oldValue: null, newValue: "Completed" }] });
  revalidatePath(`/complaints/${complaintId}`);
  return { success: true, id: complaintId };
}

// ── Escalation ──────────────────────────────────────────────────────────────

export async function addComplaintEscalation(complaintId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await authed(COMPLAINT_WRITE_ROLES);
  if ("error" in a) return { error: a.error };
  const { user, admin } = a;
  const toLevel = String(formData.get("toLevel") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const toOfficer = String(formData.get("toOfficer") ?? "");
  const { error } = await admin.from("escalation_logs").insert({
    entity_type: "complaint",
    entity_id: complaintId,
    to_level: toLevel || null,
    to_officer: toOfficer || null,
    reason: reason || null,
    escalated_on: todayISO(),
    status: "Open",
    created_by: user.id,
  });
  if (error) return { error: error.message };
  await admin.from("complaints").update({ status: "Escalated", escalation_level: toLevel || null, updated_by: user.id }).eq("id", complaintId);
  await addTimeline(admin, { complaintId, eventType: "Escalation", title: `Escalated${toLevel ? ` to ${toLevel}` : ""}`, summary: reason || null, createdBy: user.id });
  await writeAudit(admin, { entityType: "complaint", entityId: complaintId, changedBy: user.id, changes: [{ field: "escalation", oldValue: null, newValue: toLevel || "escalated" }] });
  revalidatePath(`/complaints/${complaintId}`);
  return { success: true, id: complaintId };
}

// ── Apply OCR/AI extraction (review screen) ─────────────────────────────────

export async function applyDocumentExtraction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await authed(COMPLAINT_VERIFY_ROLES);
  if ("error" in a) return { error: a.error };
  const { user, admin } = a;
  const obj: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) obj[k] = v;
  for (const b of ["createReply", "createAction"]) obj[b] = formData.get(b) === "on" || formData.get(b) === "true";
  const parsed = applyExtractionSchema.safeParse(obj);
  if (!parsed.success) return { error: "Please fix the errors below.", fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;

  const { data: doc } = await admin.from("complaint_documents").select("id, complaint_id, document_type").eq("id", d.documentId).single();
  if (!doc) return { error: "Document not found." };
  const complaintId = doc.complaint_id as string;

  const update: Record<string, unknown> = { updated_by: user.id };
  if (d.externalComplaintNumber) update.complaint_number = d.externalComplaintNumber;
  if (d.complaintGivenDate) update.date_submitted = d.complaintGivenDate;
  if (d.replySummary) { update.latest_reply_summary = d.replySummary; update.latest_reply_date = d.replyDate ?? todayISO(); }
  if (d.actionTakenSummary) { update.latest_action_taken_summary = d.actionTakenSummary; update.latest_action_taken_date = d.actionTakenDate ?? todayISO(); }
  if (d.suggestedStatus) update.status = d.suggestedStatus;
  if (d.nextFollowUpDate) { update.next_follow_up_date = d.nextFollowUpDate; update.next_action_date = d.nextFollowUpDate; }
  await admin.from("complaints").update(update).eq("id", complaintId);

  if (d.createReply && d.replySummary) {
    await admin.from("complaint_replies").insert({
      complaint_id: complaintId, reply_date: d.replyDate ?? null, reply_summary: d.replySummary,
      document_id: d.documentId, issues_remaining: d.pendingIssues ?? null, created_by: user.id,
    });
    await addTimeline(admin, { complaintId, eventType: "Reply Received", title: "Reply applied from document", summary: d.replySummary, createdBy: user.id, relatedDocumentId: d.documentId });
  }
  if (d.createAction && d.actionTakenSummary) {
    await admin.from("complaint_action_taken").insert({
      complaint_id: complaintId, action_taken_date: d.actionTakenDate ?? null, action_summary: d.actionTakenSummary,
      document_id: d.documentId, pending_work: d.pendingIssues ?? null, created_by: user.id,
    });
    await addTimeline(admin, { complaintId, eventType: "Action Taken", title: "Action applied from document", summary: d.actionTakenSummary, createdBy: user.id, relatedDocumentId: d.documentId });
  }
  if (d.nextFollowUpDate) {
    await addReminder(admin, { complaintId, title: "Follow up (from document)", dueDate: d.nextFollowUpDate, reminderType: "Follow-up with engineer", createdBy: user.id });
  }

  await admin.from("complaint_documents").update({ verification_status: "Verified", verified_by: user.id, verified_at: new Date().toISOString() }).eq("id", d.documentId);
  await writeAudit(admin, { entityType: "complaint", entityId: complaintId, changedBy: user.id, changes: [{ field: "document_applied", oldValue: null, newValue: d.documentId }] });
  revalidatePath(`/complaints/${complaintId}`);
  return { success: true, id: complaintId };
}

export async function setDocumentVerification(documentId: string, complaintId: string, status: string): Promise<ActionState> {
  const a = await authed(COMPLAINT_VERIFY_ROLES);
  if ("error" in a) return { error: a.error };
  const { user, admin } = a;
  const { error } = await admin.from("complaint_documents").update({ verification_status: status, verified_by: user.id, verified_at: new Date().toISOString() }).eq("id", documentId);
  if (error) return { error: error.message };
  await writeAudit(admin, { entityType: "complaint", entityId: complaintId, changedBy: user.id, changes: [{ field: "doc_verification", oldValue: null, newValue: status }] });
  revalidatePath(`/complaints/${complaintId}`);
  return { success: true, id: complaintId };
}

// ── AI drafts ───────────────────────────────────────────────────────────────

function complaintContext(c: Record<string, any>): string {
  return [
    `Case: ${c.internal_case_number ?? "—"} | ${c.title}`,
    `Type: ${c.type}${c.complaint_subtype ? ` / ${c.complaint_subtype}` : ""} | Status: ${c.status} | Priority: ${c.priority ?? "—"}`,
    c.complaint_number ? `External complaint no: ${c.complaint_number}` : "",
    c.date_submitted ? `Complaint given on: ${c.date_submitted}` : "",
    c.location ? `Location: ${c.location}${c.landmark ? `, ${c.landmark}` : ""}` : "",
    c.responsible_department ? `Department: ${c.responsible_department}` : "",
    c.description ? `Description: ${c.description}` : "",
    c.requested_action ? `Requested action: ${c.requested_action}` : "",
    c.latest_reply_summary ? `Latest reply (${c.latest_reply_date ?? "?"}): ${c.latest_reply_summary}` : "No reply received yet.",
    c.latest_action_taken_summary ? `Latest action taken (${c.latest_action_taken_date ?? "?"}): ${c.latest_action_taken_summary}` : "No action taken recorded yet.",
    c.assigned_engineer?.full_name ? `Assigned engineer: ${c.assigned_engineer.full_name} (${c.assigned_engineer.designation ?? ""})` : "",
    c.ward?.new_name ? `Ward: ${c.ward.new_no} ${c.ward.new_name}` : "",
  ].filter(Boolean).join("\n");
}

export async function generateComplaintDraft(input: {
  complaintId: string;
  kind: ComplaintDraftKind;
  tone?: LegalTone;
  language?: DraftLanguage;
}): Promise<{ ok: boolean; text?: string; error?: string }> {
  const a = await authed([...COMPLAINT_WRITE_ROLES, "FIELD_OFFICER"]);
  if ("error" in a) return { ok: false, error: a.error };
  const { admin } = a;
  const { data: c } = await admin
    .from("complaints")
    .select("*, ward:wards!ward_id(new_no,new_name), assigned_engineer:contacts!assigned_engineer_id(full_name,designation)")
    .eq("id", input.complaintId)
    .single();
  if (!c) return { ok: false, error: "Complaint not found." };
  const { system, prompt } = buildComplaintDraftPrompt({
    kind: input.kind,
    complaintContext: complaintContext(c as Record<string, any>),
    tone: input.tone,
    language: input.language,
  });
  const r = await generateText({ system, prompt });
  return { ok: r.ok, text: r.text, error: r.error };
}

/** Short-lived signed URL for viewing a private document (original or processed). */
export async function getDocumentViewUrl(
  documentId: string,
  which: "original" | "processed" = "original",
): Promise<{ url?: string; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { error: "Sign in to view documents." };
  let admin: SupabaseClient;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "Storage not configured." };
  }
  const { data: doc } = await admin
    .from("complaint_documents")
    .select("storage_bucket, storage_path, processed_storage_path")
    .eq("id", documentId)
    .single();
  if (!doc) return { error: "Document not found." };
  const bucket = which === "processed" ? "complaint-processed-images" : doc.storage_bucket;
  const path = which === "processed" ? doc.processed_storage_path : doc.storage_path;
  if (!path) return { error: "File not available." };
  const url = await getSignedUrl(bucket, path, 3600);
  return url ? { url } : { error: "Could not create signed URL." };
}

export async function saveComplaintAiDraft(input: {
  complaintId: string;
  kind: string;
  title?: string;
  content: string;
  language?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const a = await authed([...COMPLAINT_WRITE_ROLES, "FIELD_OFFICER"]);
  if ("error" in a) return { ok: false, error: a.error };
  const { user, admin } = a;
  const { data, error } = await admin.from("ai_drafts").insert({
    entity_type: "complaint",
    entity_id: input.complaintId,
    kind: input.kind,
    content: input.content,
    language: input.language ?? null,
    created_by: user.id,
  }).select("id").single();
  if (error) return { ok: false, error: error.message };
  await addTimeline(admin, { complaintId: input.complaintId, eventType: "Note", title: `AI draft saved: ${input.title ?? input.kind}`, createdBy: user.id });
  revalidatePath(`/complaints/${input.complaintId}`);
  return { ok: true, id: data.id };
}
