import "server-only";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { deleteTempDir } from "@/lib/forensic/zip";
import { extractZipFileToTempDir } from "@/lib/forensic/zip-stream";
import { processForensicBatch } from "@/lib/forensic/import-runner";
import { commitForensicJobs } from "@/lib/forensic/commit-runner";
import { notifyUser } from "@/lib/notifications";
import type { ForensicJobResult } from "@/lib/forensic/skill-output";
import { bandProgress } from "./types";
import { deleteStagedFile, stagedSize } from "./staging";
import { adminForQueue, claimNextQueued, requeueOrphanedProcessing, updateImportSession } from "./store";

/**
 * The ONE background import worker. Uploads queue in import_uploads; this
 * loop claims them FIFO and runs, per ZIP:
 *
 *   Extracting   — stream-unzip the staged file into a temp dir (35→55 %)
 *   Analyzing    — the existing forensic_import_batches pipeline    (55→72 %)
 *   Creating     — auto-commit → complaints + R2 uploads            (72→99 %)
 *
 * Progress/stage/message land on the session row after every step (throttled),
 * which also pokes the SSE bus — the client just renders what the row says.
 * The loop is cached on globalThis so dev HMR / route-module duplication can't
 * start two of them; kickImportWorker() is safe to call from anywhere, as
 * often as you like. If the server dies mid-run, the next kick re-queues the
 * orphaned 'processing' rows and work continues — this is what lets the user
 * close the browser (or the whole app) and find the import finished later.
 */

const G_KEY = "__gbaImportWorker__";

interface WorkerState {
  running: boolean;
  recovered: boolean;
}

function state(): WorkerState {
  const g = globalThis as Record<string, unknown>;
  if (!g[G_KEY]) g[G_KEY] = { running: false, recovered: false } satisfies WorkerState;
  return g[G_KEY] as WorkerState;
}

export function kickImportWorker(): void {
  const s = state();
  if (s.running) return;
  s.running = true;
  void loop()
    .catch((e) => console.error("[import-worker] loop crashed", e))
    .finally(() => {
      state().running = false;
    });
}

async function loop(): Promise<void> {
  const admin = adminForQueue();
  const s = state();
  if (!s.recovered) {
    s.recovered = true;
    const n = await requeueOrphanedProcessing(admin);
    if (n) console.log(`[import-worker] re-queued ${n} orphaned session(s) after restart`);
  }

  for (;;) {
    const session = await claimNextQueued(admin);
    if (!session) return; // queue drained — the next upload kicks us again

    const t0 = Date.now();
    console.log(`[import-worker] processing session=${session.id} file=${session.fileName} ts=${new Date().toISOString()}`);
    try {
      await processOne(session);
      console.log(`[import-worker] session done id=${session.id} ms=${Date.now() - t0}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Import failed";
      console.error(`[import-worker] session FAILED id=${session.id} ts=${new Date().toISOString()}`, e);
      await updateImportSession(
        admin,
        session.id,
        { status: "failed", error: msg, finished_at: new Date().toISOString(), message: msg },
        { stage: "Failed", msg },
      );
      if (session.createdBy) {
        await notifyUser(admin, session.createdBy, {
          type: "job_failed",
          title: `Import failed: ${session.fileName}`,
          body: msg,
          link: "/complaints/import",
        });
      }
      await deleteStagedFile(session.stagedPath);
    }
  }
}

type Claimed = NonNullable<Awaited<ReturnType<typeof claimNextQueued>>>;

async function processOne(session: Claimed): Promise<void> {
  const admin = adminForQueue();
  const userId = session.createdBy;
  if (!userId) throw new Error("Upload session has no owner.");
  if (!session.stagedPath || (await stagedSize(session.stagedPath)) !== session.fileSize) {
    throw new Error("The staged upload is no longer on this server — please re-upload the ZIP.");
  }

  // Throttled progress writer (≤ ~2 DB writes/sec; SSE follows the DB row).
  let lastWrite = 0;
  const report = async (progress: number, stage: string, msg: string, force = false) => {
    const now = Date.now();
    if (!force && now - lastWrite < 600) return;
    lastWrite = now;
    await updateImportSession(admin, session.id, { progress, stage, message: msg }, { stage, msg });
  };

  // ── 1) Extract ─────────────────────────────────────────────────────────────
  const tempDir = path.join(os.tmpdir(), "gba-forensic-import", randomUUID());
  await report(bandProgress("extract", 0), "Extracting", "Opening the ZIP…", true);
  try {
    const manifest = await extractZipFileToTempDir(session.stagedPath, tempDir, (p) => {
      const frac = p.totalBytes ? p.bytesRead / p.totalBytes : 0;
      void report(
        bandProgress("extract", frac),
        "Extracting",
        `Extracting files… ${p.filesDone} file(s) out${p.currentFile ? ` — ${p.currentFile.split("/").pop()}` : ""}`,
      );
    });
    await report(bandProgress("extract", 1), "Extracting", `Extracted ${manifest.length} file(s).`, true);

    // ── 2) Analyze (reuses the forensic_import_batches pipeline) ─────────────
    const { data: batchRow, error: batchErr } = await admin
      .from("forensic_import_batches")
      .insert({
        status: "Processing",
        extract_dir: tempDir,
        original_file_name: session.fileName,
        zip_size: session.fileSize,
        created_by: userId,
      })
      .select("id")
      .single();
    if (batchErr || !batchRow) throw new Error(batchErr?.message || "Could not create the import batch.");
    const batchId = batchRow.id as string;
    await updateImportSession(admin, session.id, { batch_id: batchId });

    await report(bandProgress("analyze", 0), "Analyzing", "Reading job folders, forensic reports and letters…", true);
    await processForensicBatch(batchId, tempDir, (p) => {
      void report(bandProgress("analyze", p.fraction), "Analyzing", p.message);
    });

    const { data: batch } = await admin
      .from("forensic_import_batches")
      .select("status, jobs, error")
      .eq("id", batchId)
      .single();
    if (!batch || batch.status === "Failed") {
      throw new Error((batch?.error as string) || "Analysis failed — the ZIP had no readable job folders.");
    }
    const jobs = ((batch.jobs as ForensicJobResult[]) ?? []).filter(Boolean);
    const importable = jobs.filter((j) => !j.skip && j.validCode);
    await updateImportSession(admin, session.id, { job_codes: jobs.map((j) => j.jobCode) });
    if (!importable.length) {
      throw new Error("No valid job-code folders found in this ZIP.");
    }

    // ── 3) Review gate or auto-commit ────────────────────────────────────────
    if (!session.autoCommit) {
      await updateImportSession(
        admin,
        session.id,
        { status: "review", progress: bandProgress("analyze", 1), stage: "Ready for review", message: "Analysis done — review the jobs, then create the complaints." },
        { stage: "Ready for review", msg: `${importable.length} job(s) parsed — waiting for your review.` },
      );
      await deleteStagedFile(session.stagedPath);
      await notifyUser(admin, userId, {
        type: "info",
        title: `Import ready for review: ${session.fileName}`,
        body: `${importable.length} job folder(s) parsed.`,
        link: `/complaints/import?import=${batchId}`,
      });
      return;
    }

    await report(bandProgress("commit", 0), "Creating complaints", `Committing ${importable.length} job(s)…`, true);
    const result = await commitForensicJobs(admin, {
      batchId,
      tempDirPath: tempDir,
      jobs,
      userId,
      onProgress: (p) => {
        void report(bandProgress("commit", p.fraction), "Creating complaints", p.message);
      },
      notify: false, // the session-level notification below covers it
    });
    if (result.error || !result.success) throw new Error(result.error || "Commit failed.");

    const okJobs = (result.perJob ?? []).filter((p) => !p.error);
    const failJobs = (result.perJob ?? []).filter((p) => p.error);
    const complaintIds = result.createdComplaintIds ?? [];
    const fileFails = (result.perJob ?? []).flatMap((p) => p.filesFailed ?? []);

    const doneMsg =
      `${okJobs.length} complaint(s) created` +
      (failJobs.length ? `, ${failJobs.length} job(s) failed` : "") +
      (fileFails.length ? `, ${fileFails.length} file(s) failed to store` : "") +
      ".";
    await updateImportSession(
      admin,
      session.id,
      {
        status: failJobs.length && !okJobs.length ? "failed" : "done",
        progress: 100,
        stage: "Done",
        message: doneMsg,
        complaint_ids: complaintIds,
        error: failJobs.length ? failJobs.map((f) => `${f.jobCode}: ${f.error}`).join("; ") : null,
        finished_at: new Date().toISOString(),
      },
      { stage: "Done", msg: doneMsg },
    );
    await notifyUser(admin, userId, {
      type: failJobs.length ? "job_failed" : "job_done",
      title: `Import finished: ${session.fileName}`,
      body: doneMsg,
      link: complaintIds.length === 1 ? `/complaints/${complaintIds[0]}` : "/complaints",
      entityType: "complaint",
    });
    await deleteStagedFile(session.stagedPath);
    // commitForensicJobs already deleted tempDir.
  } catch (e) {
    await deleteTempDir(tempDir);
    throw e;
  }
}
