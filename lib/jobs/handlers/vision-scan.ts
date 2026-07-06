import "server-only";
/**
 * The "vision_scan" job handler — wraps scanDivisionVisualDuplicates (the
 * pairwise-AI print→scan duplicate detector). Previously the "Scan visually"
 * button awaited the whole scan inline (up to 60 sequential vision-API calls
 * — potentially minutes), disabling itself and dying if the user navigated
 * away. The runJobPhotoDuplicateAudit HASH scan is deliberately NOT migrated:
 * it's called directly from page loads (app/complaints/duplicate-photos,
 * app/complaints/oversight), not a user-clicked "start" button, and finishes
 * in-process in a couple of seconds — the same "page load query, not a task"
 * reasoning that keeps the dashboard/treemap queries out of this framework too.
 */
import { registerJobHandler } from "@/lib/jobs/registry";
import type { JobHandler } from "@/lib/jobs/types";
import { scanDivisionVisualDuplicates } from "@/lib/forensic/job-photo-dedupe";

export interface VisionScanJobInput {
  division: string;
}

const handler: JobHandler = async (ctx) => {
  const input = ctx.input as VisionScanJobInput;

  const result = await scanDivisionVisualDuplicates(input.division, {
    onProgress: async (done, total) => {
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      await ctx.updateProgress(pct, "comparing", `Comparing pair ${done + 1} of ${total}…`);
    },
    isCancelled: () => ctx.isCancelled(),
  });

  if (!result.ok) {
    return { error: result.error ?? "Visual scan failed" };
  }
  return { result };
};

registerJobHandler("vision_scan", handler);
