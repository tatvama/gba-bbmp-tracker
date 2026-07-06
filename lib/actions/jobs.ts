"use server";

import { after } from "next/server";
import { requireRole, getSessionUser, AuthorizationError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMPLAINT_FIELD_ROLES, COMPLAINT_DRAFT_KINDS, type ComplaintDraftKind } from "@/lib/constants";
import { startJob, dispatchJob } from "@/lib/jobs/runner";
import { listAllTaskItems } from "@/lib/jobs/adapters";
import type { JobType, TaskItem } from "@/lib/jobs/types";
import type { DraftLanguage, LegalTone } from "@/lib/constants";
// Side-effect import: registers every job type's handler (ai_draft today,
// more as later stages land) — see lib/jobs/handlers/index.ts.
import "@/lib/jobs/handlers";

const nowISO = () => new Date().toISOString();

export interface BackgroundJob {
  id: string;
  type: string;
  status: "queued" | "running" | "retrying" | "done" | "failed" | "cancelled";
  title: string | null;
  entity_type: string | null;
  entity_id: string | null;
  progress: number | null;
  result: unknown;
  error: string | null;
  created_at: string;
  cancel_requested?: boolean;
  retry_count?: number;
  max_retries?: number;
  next_retry_at?: string | null;
  finished_at?: string | null;
  updated_at?: string | null;
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

  const r = await startJob(admin, {
    type: "ai_draft",
    title,
    entityType: "complaint",
    entityId: input.complaintId,
    input,
    userId: user.id,
    link: `/complaints/${input.complaintId}?tab=ai`,
  });
  return r;
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

/** Everything the Global Task Center shows for the current user: real
 *  background_jobs rows (queued/running/retrying + a recent-history window of
 *  terminal ones) merged with the ZIP-import/ack-reconciliation read-only
 *  adapters, all normalized into one TaskItem shape. Thin wrapper over
 *  lib/jobs/adapters.ts's plain listAllTaskItems, which the SSE route
 *  (app/api/jobs/events/route.ts) also calls directly with an explicit userId
 *  rather than re-deriving it from cookies per snapshot. */
export async function listAllTasks(opts: { recentHours?: number } = {}): Promise<TaskItem[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const admin = createAdminClient();
  return listAllTaskItems(admin, user.id, opts);
}

/** User-requested cancellation. A queued job (never claimed by a handler) is
 *  cancelled immediately; a running/retrying one is flagged and the handler's
 *  own ctx.isCancelled() check (where it loops — see lib/jobs/runner.ts)
 *  honors it cooperatively on its next check, since single-process Node can't
 *  forcibly kill an in-flight async function from the outside. */
export async function cancelJobAction(jobId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Not authorized" };
  const admin = createAdminClient();
  const { data: job } = await admin.from("background_jobs").select("created_by, status").eq("id", jobId).maybeSingle();
  if (!job || job.created_by !== user.id) return { ok: false, error: "Job not found." };
  if (!["queued", "running", "retrying"].includes(job.status as string)) return { ok: true };

  await admin.from("background_jobs").update({ cancel_requested: true }).eq("id", jobId);
  if (job.status === "queued") {
    await admin.from("background_jobs").update({ status: "cancelled", finished_at: nowISO() }).eq("id", jobId);
  }
  return { ok: true };
}

/** Re-dispatch a failed job through the SAME handler it originally used,
 *  reusing its stored input — this is the generic retry path every job type
 *  gets for free from the framework, not a per-feature reimplementation. */
export async function retryJobAction(jobId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Not authorized" };
  const admin = createAdminClient();
  const { data: job } = await admin
    .from("background_jobs")
    .select("id, type, title, entity_type, entity_id, created_by, status")
    .eq("id", jobId)
    .maybeSingle();
  if (!job || job.created_by !== user.id) return { ok: false, error: "Job not found." };
  if (job.status !== "failed") return { ok: false, error: "Only failed jobs can be retried." };

  await admin.from("background_jobs").update({ status: "queued", error: null, cancel_requested: false, retry_count: 0, finished_at: null }).eq("id", jobId);
  const meta = {
    type: job.type as JobType,
    userId: user.id,
    title: (job.title as string | null) ?? job.type,
    entityType: job.entity_type as string | null,
    entityId: job.entity_id as string | null,
  };
  after(() => dispatchJob(jobId, meta));
  return { ok: true };
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
