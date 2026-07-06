import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { publishImportChange } from "./bus";
import { publishJobChange } from "@/lib/jobs/bus";
import type { ImportUploadEvent, ImportUploadSnapshot, ImportUploadStatus } from "./types";

/**
 * DB access for import_uploads (the chunked-upload sessions / processing
 * queue). All writes go through updateImportSession so every change also
 * appends to the session's rolling event log and pokes the SSE bus.
 */

const MAX_EVENTS = 40;
/** Sessions in a terminal state stay visible in the client list this long. */
const DONE_VISIBLE_HOURS = 24;

type Row = Record<string, unknown>;

export function rowToSnapshot(r: Row): ImportUploadSnapshot {
  return {
    id: r.id as string,
    kind: (r.kind as string) ?? "forensic_zip",
    fileName: (r.file_name as string) ?? "",
    fileSize: Number(r.file_size ?? 0),
    fingerprint: (r.fingerprint as string) ?? "",
    chunkSize: Number(r.chunk_size ?? 0),
    receivedBytes: Number(r.received_bytes ?? 0),
    status: (r.status as ImportUploadStatus) ?? "uploading",
    stage: (r.stage as string) ?? null,
    progress: Number(r.progress ?? 0),
    message: (r.message as string) ?? null,
    error: (r.error as string) ?? null,
    autoCommit: Boolean(r.auto_commit ?? true),
    batchId: (r.batch_id as string) ?? null,
    jobCodes: (r.job_codes as string[]) ?? [],
    complaintIds: (r.complaint_ids as string[]) ?? [],
    createdAt: (r.created_at as string) ?? "",
    finishedAt: (r.finished_at as string) ?? null,
    events: ((r.events as ImportUploadEvent[]) ?? []).slice(-10),
  };
}

const SELECT_COLS =
  "id, kind, file_name, file_size, fingerprint, chunk_size, received_bytes, status, stage, progress, message, error, events, auto_commit, batch_id, job_codes, complaint_ids, created_by, created_at, finished_at, staged_path";

export async function getImportSession(
  admin: SupabaseClient,
  id: string,
): Promise<(ImportUploadSnapshot & { stagedPath: string | null; createdBy: string | null }) | null> {
  const { data } = await admin.from("import_uploads").select(SELECT_COLS).eq("id", id).maybeSingle();
  if (!data) return null;
  return {
    ...rowToSnapshot(data as Row),
    stagedPath: (data as Row).staged_path as string | null,
    createdBy: (data as Row).created_by as string | null,
  };
}

/** The sessions a user's import page cares about (active + last 24 h history). */
export async function listImportSessions(admin: SupabaseClient, userId: string): Promise<ImportUploadSnapshot[]> {
  const cutoff = new Date(Date.now() - DONE_VISIBLE_HOURS * 3600 * 1000).toISOString();
  const { data } = await admin
    .from("import_uploads")
    .select(SELECT_COLS)
    .eq("created_by", userId)
    .or(`status.in.(uploading,queued,processing,review),created_at.gte.${cutoff}`)
    .order("created_at", { ascending: true })
    .limit(50);
  return ((data as Row[]) ?? []).map(rowToSnapshot);
}

/**
 * Patch a session; optionally append a live event line. Fire-and-forget safe:
 * never throws (progress reporting must not kill the pipeline it reports on).
 */
export async function updateImportSession(
  admin: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
  event?: { stage: string; msg: string },
): Promise<void> {
  try {
    let next = patch;
    if (event) {
      const { data } = await admin.from("import_uploads").select("events, created_by").eq("id", id).maybeSingle();
      const events = (((data as Row | null)?.events as ImportUploadEvent[]) ?? [])
        .concat([{ t: Date.now(), stage: event.stage, msg: event.msg }])
        .slice(-MAX_EVENTS);
      next = { ...patch, events };
      const owner = (data as Row | null)?.created_by as string | null;
      await admin.from("import_uploads").update(next).eq("id", id);
      // publishJobChange nudges the Task Center's adapter (lib/jobs/adapters.ts)
      // via the same in-process bus the generic job runner uses — this engine's
      // own storage/execution are otherwise untouched.
      if (owner) { publishImportChange(owner); publishJobChange(owner); }
      return;
    }
    const { data } = await admin.from("import_uploads").update(next).eq("id", id).select("created_by").maybeSingle();
    const owner = (data as Row | null)?.created_by as string | null;
    if (owner) { publishImportChange(owner); publishJobChange(owner); }
  } catch (e) {
    console.warn("[import-queue] updateImportSession failed", id, e);
  }
}

/**
 * Claim the oldest queued session (FIFO across ALL users — one global worker
 * processes one ZIP at a time). The status-guarded UPDATE makes the claim
 * atomic enough for the single-process dev/server runtime.
 */
export async function claimNextQueued(
  admin: SupabaseClient,
): Promise<(ImportUploadSnapshot & { stagedPath: string | null; createdBy: string | null }) | null> {
  const { data: candidates } = await admin
    .from("import_uploads")
    .select("id")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1);
  const id = (candidates?.[0] as Row | undefined)?.id as string | undefined;
  if (!id) return null;
  const { data: claimed } = await admin
    .from("import_uploads")
    .update({ status: "processing", stage: "Starting", message: "Picked up by the import worker." })
    .eq("id", id)
    .eq("status", "queued")
    .select(SELECT_COLS)
    .maybeSingle();
  if (!claimed) return null; // someone else got it — caller loops again
  const row = claimed as Row;
  const snap = {
    ...rowToSnapshot(row),
    stagedPath: row.staged_path as string | null,
    createdBy: row.created_by as string | null,
  };
  if (snap.createdBy) { publishImportChange(snap.createdBy); publishJobChange(snap.createdBy); }
  return snap;
}

/**
 * Boot-time recovery: sessions stuck in 'processing' when the server died are
 * re-queued (their staged file is still on disk) so work continues without the
 * user doing anything. Called once per process from the worker.
 */
export async function requeueOrphanedProcessing(admin: SupabaseClient): Promise<number> {
  const { data } = await admin
    .from("import_uploads")
    .update({ status: "queued", stage: "Waiting in queue", message: "Server restarted — resuming from the queue." })
    .eq("status", "processing")
    .select("id, created_by");
  const rows = (data as Row[]) ?? [];
  for (const r of rows) {
    const owner = r.created_by as string | null;
    if (owner) { publishImportChange(owner); publishJobChange(owner); }
  }
  return rows.length;
}

export function adminForQueue(): SupabaseClient {
  return createAdminClient();
}
