import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaskItem, JobStatus, JobType } from "./types";
import { listActiveAndRecentJobs, type JobRow } from "./queries";
import { moduleLabelForType, resultLinkForRow, isCancellableType } from "./task-links";

/**
 * Read-side projections of the two existing durable pipelines that are
 * explicitly OUT OF SCOPE for migration (they create complaints/RTIs as an
 * end result — see the plan's exclusion boundary): forensic ZIP import
 * (import_uploads) and ack reconciliation (ack_import_batches). Neither
 * pipeline's execution engine is touched here — these are pure normalize
 * functions plus a read query, so the Global Task Center can SHOW them
 * alongside real background_jobs rows without background_jobs ever storing
 * their state. cancellable is always false: no cancel hook exists in either
 * engine and this plan doesn't add one to a working system.
 */

// ---- import_uploads (forensic ZIP import) --------------------------------

interface ImportUploadRow {
  id: string;
  file_name: string | null;
  status: string;
  stage: string | null;
  progress: number | null;
  message: string | null;
  error: string | null;
  created_at: string;
  updated_at: string | null;
  finished_at: string | null;
}

const IMPORT_STATUS_MAP: Record<string, JobStatus> = {
  uploading: "running",
  queued: "queued",
  processing: "running",
  review: "done", // the automated pipeline finished; a human reviews before commit
  done: "done",
  failed: "failed",
  cancelled: "cancelled",
};

export function adaptImportUpload(row: ImportUploadRow): TaskItem {
  return {
    id: `import_uploads:${row.id}`,
    source: "import_uploads",
    type: "forensic_zip_import",
    module: "ZIP Import",
    title: row.file_name ?? "ZIP import",
    status: IMPORT_STATUS_MAP[row.status] ?? "running",
    entityType: null,
    entityId: null,
    operation: null,
    subtype: null,
    progress: row.progress,
    stage: row.stage,
    message: row.message ?? (row.status === "review" ? "Ready for review" : null),
    result: null,
    error: row.error,
    cancellable: false,
    resultLink: row.status === "review" ? `/complaints/import?import=${row.id}` : "/complaints/import",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
  };
}

export async function listImportUploadTasks(admin: SupabaseClient, userId: string, recentHours = 24): Promise<TaskItem[]> {
  const cutoff = new Date(Date.now() - recentHours * 3_600_000).toISOString();
  const { data } = await admin
    .from("import_uploads")
    .select("id, file_name, status, stage, progress, message, error, created_at, updated_at, finished_at")
    .eq("created_by", userId)
    .or(`status.in.(uploading,queued,processing,review),created_at.gte.${cutoff}`)
    .order("created_at", { ascending: false })
    .limit(50);
  return ((data ?? []) as ImportUploadRow[]).map(adaptImportUpload);
}

// ---- ack_import_batches (ack reconciliation) ------------------------------

interface AckBatchRow {
  id: string;
  original_name: string | null;
  status: string;
  stage: string | null;
  message: string | null;
  error: string | null;
  page_count: number | null;
  processed_pages: number | null;
  created_at: string;
  updated_at: string | null;
  finished_at: string | null;
}

const ACK_STATUS_MAP: Record<string, JobStatus> = {
  processing: "running",
  review: "done", // the automated match pass finished; a human confirms matches before commit
  committing: "running",
  committed: "done",
  failed: "failed",
};

export function adaptAckBatch(row: AckBatchRow): TaskItem {
  const progress = row.page_count ? Math.round(((row.processed_pages ?? 0) / row.page_count) * 100) : null;
  return {
    id: `ack_import_batches:${row.id}`,
    source: "ack_import_batches",
    type: "ack_reconciliation",
    module: "Ack Reconciliation",
    title: row.original_name ?? "Acknowledgment batch",
    status: ACK_STATUS_MAP[row.status] ?? "running",
    entityType: null,
    entityId: null,
    operation: null,
    subtype: null,
    progress,
    stage: row.stage,
    message: row.message ?? (row.status === "review" ? "Ready for review" : null),
    result: null,
    error: row.error,
    cancellable: false,
    resultLink: `/complaints/acknowledgments/${row.id}`,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
  };
}

export async function listAckBatchTasks(admin: SupabaseClient, userId: string, recentHours = 24): Promise<TaskItem[]> {
  const cutoff = new Date(Date.now() - recentHours * 3_600_000).toISOString();
  const { data } = await admin
    .from("ack_import_batches")
    .select("id, original_name, status, stage, message, error, page_count, processed_pages, created_at, updated_at, finished_at")
    .eq("created_by", userId)
    .or(`status.in.(processing,review,committing),created_at.gte.${cutoff}`)
    .order("created_at", { ascending: false })
    .limit(50);
  return ((data ?? []) as AckBatchRow[]).map(adaptAckBatch);
}

/** Everything the two adapters cover, merged and sorted — called alongside
 *  background_jobs rows to build the Task Center's full list. */
export async function listAdaptedTasks(admin: SupabaseClient, userId: string, recentHours = 24): Promise<TaskItem[]> {
  const [imports, acks] = await Promise.all([
    listImportUploadTasks(admin, userId, recentHours),
    listAckBatchTasks(admin, userId, recentHours),
  ]);
  return [...imports, ...acks].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ---- background_jobs (the real framework jobs — ai_draft today, more as
// later stages register) ----------------------------------------------------

/** The frontend Task Registry's identity model needs an `operation`/`subtype`
 *  per job, derived from the job's own `input` — never from `title`, which is
 *  a display string that can be reworded without that being an identity
 *  change. One case per type that actually has a narrower concept than its
 *  entityType/entityId already captures; every other type is precise enough
 *  as-is and projects both as null. */
export function deriveOperationSubtype(type: string, input: unknown): { operation: string | null; subtype: string | null } {
  const i = (input ?? {}) as Record<string, unknown>;
  switch (type as JobType) {
    case "ai_draft":
      // Which letter kind (reminder_letter, counter_reply, ...) — the same
      // complaint can have several kinds drafted independently in parallel.
      return { operation: typeof i.kind === "string" ? i.kind : null, subtype: null };
    case "vision_scan":
      // entity_id is null for this type (a division name isn't a UUID — see
      // lib/actions/job-photo-dedupe.ts) — the division is the only thing
      // that disambiguates one scan from another.
      return { operation: null, subtype: typeof i.division === "string" ? i.division : null };
    default:
      // ocr/export already have a precise enough entityId (or no narrower
      // concept exists) — nothing to add.
      return { operation: null, subtype: null };
  }
}

/** Real framework jobs use their raw id (unprefixed) so retryJobAction /
 *  cancelJobAction — which only ever apply to background_jobs rows — can use
 *  a TaskItem's id directly with no parsing. */
export function adaptBackgroundJob(row: JobRow): TaskItem {
  const result = row.result as { stage?: string; message?: string; complaintId?: string | null } | null;
  const { operation, subtype } = deriveOperationSubtype(row.type, row.input);
  // OCR's entityId is the DOCUMENT (correct for the duplicate-prevention
  // index — you shouldn't OCR the same document twice concurrently), but the
  // useful "Open Result" destination is the document's COMPLAINT, which the
  // handler (lib/jobs/handlers/ocr.ts) reports back in result.complaintId
  // rather than in entityId.
  const linkEntityId = row.type === "ocr" ? result?.complaintId ?? null : row.entity_id;
  const linkEntityType = row.type === "ocr" ? "complaint" : row.entity_type;
  return {
    id: row.id,
    source: "background_jobs",
    type: row.type,
    module: moduleLabelForType(row.type),
    title: row.title ?? row.type,
    status: row.status,
    entityType: row.entity_type,
    entityId: row.entity_id,
    operation,
    subtype,
    progress: row.progress,
    stage: result?.stage ?? null,
    message: result?.message ?? null,
    result: row.result,
    error: row.error,
    cancellable: isCancellableType(row.type, row.status),
    resultLink: row.status === "done" ? resultLinkForRow(row.type, linkEntityType, linkEntityId) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
  };
}

export interface TaskCenterOptions {
  recentHours?: number;
  /** The exclusion boundary is about never touching the ZIP-import/ack-
   *  reconciliation ENGINES or their complaint-creation step — it does not
   *  hide them from the Task Center, which is exactly what the read-only
   *  adapters are for. True by default; false is an escape hatch for a
   *  surface that wants ONLY real framework jobs (none needs this today). */
  includeAdapters?: boolean;
}

/** The Global Task Center's single data source: real background_jobs rows
 *  plus the two read-only adapters, all normalized into the same TaskItem
 *  shape, merged and sorted into one list. */
export async function listAllTaskItems(admin: SupabaseClient, userId: string, opts: TaskCenterOptions = {}): Promise<TaskItem[]> {
  const recentHours = opts.recentHours ?? 24;
  const jobRows = await listActiveAndRecentJobs(admin, userId, recentHours);
  const jobs = jobRows.map(adaptBackgroundJob);
  const includeAdapters = opts.includeAdapters ?? true;
  if (!includeAdapters) {
    return jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  const adapted = await listAdaptedTasks(admin, userId, recentHours);
  return [...jobs, ...adapted].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
