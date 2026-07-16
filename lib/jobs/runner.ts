import "server-only";
/**
 * The generic background-job runner. Every long-running feature this session
 * migrates (and the refactored ai_draft job) calls startJob() instead of
 * hand-rolling its own after()+DB-row wiring — this is the "every module
 * reuses the framework" primitive.
 *
 * Deliberately request-free (takes an admin SupabaseClient, never touches
 * cookies/next/headers) so sweepBackgroundJobs can run from instrumentation.ts
 * with no HTTP request in flight — same reasoning as
 * lib/complaints/escalation-scheduler.ts and lib/import-queue/worker.ts.
 */
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notifications";
import { publishJobChange } from "./bus";
import { tryAcquire, release } from "./concurrency";
import { getJobHandler, getJobConfig, allJobTypes } from "./registry";
import { decideRetry } from "./retry-policy";
import type { JobDispatchMeta, JobHandlerContext, JobType } from "./types";

const nowISO = () => new Date().toISOString();

export interface StartJobInput {
  type: JobType;
  title: string;
  entityType?: string | null;
  entityId?: string | null;
  input?: unknown;
  userId: string;
  priority?: number;
  /** In-app deep link for the completion/failure notification. */
  link?: string | null;
}

export interface StartJobResult {
  ok: boolean;
  jobId?: string;
  /** True if an identical (type, entity) job was already in flight and this
   *  call reconnected to it instead of starting a duplicate. */
  reused?: boolean;
  error?: string;
}

const UNIQUE_VIOLATION = "23505";

/**
 * Start a background job. Duplicate-safe: migration 0032's partial unique
 * index means a second identical (type, entityType, entityId) job while one
 * is queued/running fails to insert — that failure is caught here and turned
 * into "reconnect to the existing job" rather than an error.
 */
export async function startJob(admin: SupabaseClient, opts: StartJobInput): Promise<StartJobResult> {
  const { data: job, error } = await admin
    .from("background_jobs")
    .insert({
      type: opts.type,
      status: "queued",
      title: opts.title,
      entity_type: opts.entityType ?? null,
      entity_id: opts.entityId ?? null,
      input: (opts.input ?? null) as never,
      priority: opts.priority ?? 0,
      created_by: opts.userId,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      const existing = await findInFlightJob(admin, opts.type, opts.entityType ?? null, opts.entityId ?? null);
      if (existing) return { ok: true, jobId: existing, reused: true };
    }
    return { ok: false, error: error.message };
  }
  if (!job) return { ok: false, error: "Could not create the job." };
  const jobId = job.id as string;

  const meta: JobDispatchMeta = { type: opts.type, userId: opts.userId, title: opts.title, entityType: opts.entityType, entityId: opts.entityId, link: opts.link };
  after(() => dispatchJob(jobId, meta));
  return { ok: true, jobId };
}

async function findInFlightJob(admin: SupabaseClient, type: JobType, entityType: string | null, entityId: string | null): Promise<string | null> {
  let q = admin.from("background_jobs").select("id").eq("type", type).in("status", ["queued", "running"]);
  q = entityType === null ? q.is("entity_type", null) : q.eq("entity_type", entityType);
  q = entityId === null ? q.is("entity_id", null) : q.eq("entity_id", entityId);
  const { data } = await q.maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/**
 * Claim + execute one job. Called from startJob's after(), from
 * retryJobAction (lib/actions/jobs.ts), and from sweepBackgroundJobs for due
 * retries — always with the same dispatch metadata shape so none of those
 * callers need their own copy of the claim/execute/finalize logic.
 */
export async function dispatchJob(jobId: string, meta: JobDispatchMeta): Promise<void> {
  const admin = createAdminClient();
  let handler = getJobHandler(meta.type);
  if (!handler) {
    try {
      await import("@/lib/jobs/handlers");
      handler = getJobHandler(meta.type);
    } catch (e) {
      console.error(`[runner] failed to dynamically load job handlers for type "${meta.type}":`, e);
    }
  }
  const config = getJobConfig(meta.type);
  if (!config) return; // unknown type — nothing this runner can do
  if (!handler) {
    await admin.from("background_jobs").update({ status: "failed", error: `No handler registered for job type "${meta.type}".`, finished_at: nowISO() }).eq("id", jobId);
    return;
  }

  if (!tryAcquire(meta.type, config.concurrencyLimit)) {
    return; // over the concurrency limit — stays queued; the sweep will retry it later
  }

  // Progress writes are chained (never fire-and-forget) so a slow in-flight
  // write can never land AFTER the terminal done/failed/cancelled update and
  // resurrect stale "partial" progress — same race this codebase already
  // guarded against once in the pre-framework ai_draft job. Same-stage
  // updates are throttled to ~2/sec (a stage CHANGE always writes
  // immediately) so a handler streaming many small updates (tokens, pages,
  // photo pairs) doesn't hammer the DB. Hoisted above the try/catch so the
  // catch block can await it too if the handler throws instead of returning
  // {error}.
  let writeChain: Promise<unknown> = Promise.resolve();

  try {
    const { data: claimed } = await admin
      .from("background_jobs")
      .update({ status: "running" })
      .eq("id", jobId)
      .in("status", ["queued", "retrying"])
      .select("id, input")
      .maybeSingle();
    if (!claimed) return; // already claimed / cancelled / finished by someone else
    publishJobChange(meta.userId);

    let lastStage: string | undefined;
    let lastWriteAt = 0;
    const ctx: JobHandlerContext = {
      input: claimed.input,
      admin,
      jobId,
      userId: meta.userId,
      updateProgress: async (progress, stage, message, extra) => {
        const now = Date.now();
        const stageChanged = stage !== lastStage;
        if (!stageChanged && now - lastWriteAt < 500) return;
        lastStage = stage;
        lastWriteAt = now;
        writeChain = writeChain
          .then(() =>
            admin
              .from("background_jobs")
              .update({ progress, result: { stage: stage ?? null, message: message ?? null, ...(extra ?? {}) } })
              .eq("id", jobId),
          )
          .catch(() => {});
        publishJobChange(meta.userId);
      },
      isCancelled: async () => {
        const { data } = await admin.from("background_jobs").select("cancel_requested").eq("id", jobId).maybeSingle();
        return Boolean(data?.cancel_requested);
      },
    };

    const outcome = await handler(ctx);
    await writeChain;

    const { data: latest } = await admin.from("background_jobs").select("cancel_requested").eq("id", jobId).maybeSingle();
    if (latest?.cancel_requested) {
      await admin.from("background_jobs").update({ status: "cancelled", finished_at: nowISO() }).eq("id", jobId);
      publishJobChange(meta.userId);
      return;
    }

    if (outcome.error) {
      await failOrRetry(admin, jobId, meta, outcome.error, outcome.retryable, config);
      return;
    }

    await admin.from("background_jobs").update({ status: "done", progress: 100, result: (outcome.result ?? {}) as never, finished_at: nowISO() }).eq("id", jobId);
    publishJobChange(meta.userId);
    await notifyUser(admin, meta.userId, {
      type: "job_done",
      title: `${meta.title} — complete`,
      body: "Open it to review the result.",
      link: meta.link ?? undefined,
      entityType: meta.entityType,
      entityId: meta.entityId,
    });
  } catch (e) {
    await writeChain;
    const msg = e instanceof Error ? e.message : "Job failed";
    await failOrRetry(admin, jobId, meta, msg, undefined, config);
  } finally {
    release(meta.type);
  }
}

async function failOrRetry(
  admin: SupabaseClient,
  jobId: string,
  meta: JobDispatchMeta,
  errorMsg: string,
  explicitRetryable: boolean | undefined,
  config: NonNullable<ReturnType<typeof getJobConfig>>,
): Promise<void> {
  const { data: row } = await admin.from("background_jobs").select("retry_count, max_retries").eq("id", jobId).maybeSingle();
  const retryCount = (row?.retry_count as number | undefined) ?? 0;
  const maxRetries = (row?.max_retries as number | undefined) ?? config.maxRetries;
  const decision = decideRetry({ errorMsg, explicitRetryable, retryableErrorPatterns: config.retryableErrorPatterns, retryCount, maxRetries });

  if (decision.shouldRetry) {
    await admin
      .from("background_jobs")
      .update({ status: "retrying", retry_count: retryCount + 1, next_retry_at: new Date(Date.now() + decision.backoffMs).toISOString(), error: errorMsg })
      .eq("id", jobId);
    publishJobChange(meta.userId);
    return;
  }

  await admin.from("background_jobs").update({ status: "failed", error: errorMsg, finished_at: nowISO() }).eq("id", jobId);
  publishJobChange(meta.userId);
  await notifyUser(admin, meta.userId, {
    type: "job_failed",
    title: `${meta.title} — failed`,
    body: errorMsg,
    link: meta.link ?? undefined,
    entityType: meta.entityType,
    entityId: meta.entityId,
  });
}

export interface SweepResult {
  reclaimed: number;
  retried: number;
}

/**
 * Called from instrumentation.ts's existing interval (stage 9). Two jobs:
 * (1) dead-job recovery — a 'running' row older than its type's
 *     maxDurationMs means the process that owned it died mid-run (crash,
 *     restart) with no chance to mark it failed itself.
 * (2) due retries — 'retrying' rows whose backoff window has elapsed.
 * Mirrors the exact staleness-reclaim idea already used by
 * lib/import-queue/store.ts's requeueOrphanedProcessing and the AI Advisor's
 * stale-lock reclaim, generalized once here instead of reimplemented per type.
 */
export async function sweepBackgroundJobs(admin: SupabaseClient): Promise<SweepResult> {
  let reclaimed = 0;
  let retried = 0;

  for (const type of allJobTypes()) {
    const config = getJobConfig(type);
    if (!config) continue;
    const staleCutoff = new Date(Date.now() - config.maxDurationMs).toISOString();
    const { data } = await admin
      .from("background_jobs")
      .update({ status: "failed", error: "Timed out — the job exceeded its maximum allowed duration.", finished_at: nowISO() })
      .eq("type", type)
      .eq("status", "running")
      .lt("updated_at", staleCutoff)
      .select("id, created_by");
    for (const row of (data ?? []) as { id: string; created_by: string | null }[]) {
      reclaimed++;
      if (row.created_by) publishJobChange(row.created_by);
    }
  }

  const { data: due } = await admin
    .from("background_jobs")
    .select("id, type, title, entity_type, entity_id, created_by")
    .eq("status", "retrying")
    .lte("next_retry_at", nowISO())
    .limit(20);
  for (const row of (due ?? []) as { id: string; type: string; title: string | null; entity_type: string | null; entity_id: string | null; created_by: string | null }[]) {
    if (!row.created_by) continue;
    retried++;
    void dispatchJob(row.id, {
      type: row.type as JobType,
      userId: row.created_by,
      title: row.title ?? row.type,
      entityType: row.entity_type,
      entityId: row.entity_id,
    });
  }

  return { reclaimed, retried };
}
