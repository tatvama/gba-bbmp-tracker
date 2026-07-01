"use server";

import { after } from "next/server";
import { requireRole, getSessionUser, AuthorizationError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMPLAINT_FIELD_ROLES, COMPLAINT_DRAFT_KINDS, type ComplaintDraftKind } from "@/lib/constants";
import { runComplaintDraft } from "@/lib/ai/complaint-draft";
import { notifyUser } from "@/lib/notifications";
import type { DraftLanguage, LegalTone } from "@/lib/constants";

const nowISO = () => new Date().toISOString();

export interface BackgroundJob {
  id: string;
  type: string;
  status: "queued" | "running" | "done" | "failed";
  title: string | null;
  entity_type: string | null;
  entity_id: string | null;
  progress: number | null;
  result: unknown;
  error: string | null;
  created_at: string;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

/**
 * Start an AI complaint-draft as a BACKGROUND job: returns a jobId immediately,
 * then generates via after() so it keeps running even if the user navigates
 * away. On completion the draft is saved to ai_drafts (so it's there when they
 * return) and an alert is dropped into their notifications inbox.
 */
export async function startAiDraftJob(input: {
  complaintId: string;
  kind: ComplaintDraftKind;
  tone?: LegalTone;
  language?: DraftLanguage;
}): Promise<{ ok: boolean; jobId?: string; error?: string }> {
  let user;
  try {
    user = await requireRole(COMPLAINT_FIELD_ROLES);
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const admin = createAdminClient();
  const title = `${COMPLAINT_DRAFT_KINDS[input.kind] ?? "AI draft"}`;

  const { data: job, error } = await admin
    .from("background_jobs")
    .insert({
      type: "ai_draft",
      status: "running",
      title,
      entity_type: "complaint",
      entity_id: input.complaintId,
      input,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !job) return { ok: false, error: error?.message ?? "Could not start the job." };
  const jobId = job.id as string;
  const userId = user.id;
  const link = `/complaints/${input.complaintId}?tab=ai`;

  after(async () => {
    const a = createAdminClient();
    try {
      const r = await runComplaintDraft(a, input);
      if (!r.ok || !r.text) {
        await a.from("background_jobs").update({ status: "failed", error: r.error ?? "Generation failed", finished_at: nowISO() }).eq("id", jobId);
        await notifyUser(a, userId, { type: "job_failed", title: `Draft failed — ${title}`, body: r.error ?? undefined, link, entityType: "complaint", entityId: input.complaintId });
        return;
      }
      // Persist the finished draft so it survives navigation (shows in Saved drafts).
      await a.from("ai_drafts").insert({ entity_type: "complaint", entity_id: input.complaintId, kind: input.kind, content: r.text, language: input.language ?? null, created_by: userId });
      await a.from("background_jobs").update({ status: "done", progress: 100, result: { text: r.text, lintWarning: r.lintWarning ?? null }, finished_at: nowISO() }).eq("id", jobId);
      await notifyUser(a, userId, { type: "job_done", title: `Draft ready — ${title}`, body: "Open the complaint to review, edit and print it.", link, entityType: "complaint", entityId: input.complaintId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generation failed";
      await a.from("background_jobs").update({ status: "failed", error: msg, finished_at: nowISO() }).eq("id", jobId).then(() => {}, () => {});
      await notifyUser(a, userId, { type: "job_failed", title: `Draft failed — ${title}`, body: msg, link, entityType: "complaint", entityId: input.complaintId });
    }
  });

  return { ok: true, jobId };
}

/** Poll a single job (for the component that started it). */
export async function getJobAction(jobId: string): Promise<{ job?: BackgroundJob; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { error: "Not authorized" };
  const admin = createAdminClient();
  const { data } = await admin
    .from("background_jobs")
    .select("id,type,status,title,entity_type,entity_id,progress,result,error,created_at,created_by")
    .eq("id", jobId)
    .maybeSingle();
  if (!data || (data.created_by && data.created_by !== user.id)) return { error: "Job not found." };
  return { job: data as BackgroundJob };
}

/** The current user's still-running jobs — drives the global "running" indicator. */
export async function listMyActiveJobs(): Promise<BackgroundJob[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("background_jobs")
    .select("id,type,status,title,entity_type,entity_id,progress,result,error,created_at")
    .eq("created_by", user.id)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(25);
  return (data as BackgroundJob[]) ?? [];
}

/** Recent notifications + unread count for the current user (the alerts bell). */
export async function listMyNotifications(limit = 20): Promise<{ items: AppNotification[]; unread: number }> {
  const user = await getSessionUser();
  if (!user) return { items: [], unread: 0 };
  const admin = createAdminClient();
  const [{ data }, { count }] = await Promise.all([
    admin.from("notifications").select("id,type,title,body,link,read_at,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(limit),
    admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
  ]);
  return { items: (data as AppNotification[]) ?? [], unread: count ?? 0 };
}

export async function markNotificationRead(id: string): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const admin = createAdminClient();
  await admin.from("notifications").update({ read_at: nowISO() }).eq("id", id).eq("user_id", user.id);
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const admin = createAdminClient();
  await admin.from("notifications").update({ read_at: nowISO() }).eq("user_id", user.id).is("read_at", null);
  return { ok: true };
}
