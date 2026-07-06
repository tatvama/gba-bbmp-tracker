import "server-only";
/**
 * The "ifms_download" job handler — makes the IFMS portal downloader truly
 * autonomous. Previously the client had to keep calling downloadNextJob() in
 * a loop; if the user navigated away (or just didn't keep the tab open,
 * mid-loop), the run stalled at its current cursor until they came back and
 * resumed it manually. This handler calls the exact same per-job logic
 * (downloadNextJobCore, unchanged) in a server-side loop instead, checking
 * ctx.isCancelled() between job codes. convertJobCaseToComplaint (the
 * complaint-creation step that follows a completed download) is untouched
 * and stays a separate, explicit, synchronous user action.
 */
import { registerJobHandler } from "@/lib/jobs/registry";
import type { JobHandler } from "@/lib/jobs/types";
import { downloadNextJobCore } from "@/lib/actions/ifms";

export interface IfmsDownloadJobInput {
  runId: string;
}

const handler: JobHandler = async (ctx) => {
  const input = ctx.input as IfmsDownloadJobInput;
  let filesDownloaded = 0;
  let filesFailed = 0;

  for (;;) {
    if (await ctx.isCancelled()) {
      return { result: { cancelled: true, jobsDone: 0, total: 0, filesDownloaded, filesFailed } };
    }
    const step = await downloadNextJobCore(ctx.admin, input.runId, ctx.userId);
    if (!step.ok) {
      return { error: step.error ?? "Download step failed" };
    }
    filesDownloaded += step.filesDownloaded;
    filesFailed += step.filesFailed;
    const pct = step.total > 0 ? Math.round((step.cursor / step.total) * 100) : 100;
    // Structured progress (not a message string to parse) — the client
    // (components/ifms/portal-download.tsx) reads these fields directly off
    // job.result.
    await ctx.updateProgress(pct, "downloading", step.jobCode ? `Downloading ${step.jobCode}…` : "Finishing…", {
      jobsDone: step.jobsDone,
      total: step.total,
      currentJob: step.jobCode ?? null,
      filesDownloaded,
      filesFailed,
    });
    if (step.done) {
      return { result: { jobsDone: step.jobsDone, total: step.total, filesDownloaded, filesFailed } };
    }
  }
};

registerJobHandler("ifms_download", handler);
