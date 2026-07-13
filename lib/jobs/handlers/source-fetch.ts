import "server-only";
/**
 * The "source_fetch" job handler — bulk BBMP IFMS ward+year expansion. A
 * single job-code lookup is a few fast HTTP round trips and stays synchronous
 * (called directly from a server action); this job exists only for the bulk
 * case (expandWardYear can walk up to 2000 serials), mirroring vision_scan's
 * "long-running, cancellable, single shared external endpoint" shape.
 */
import { registerJobHandler } from "@/lib/jobs/registry";
import type { JobHandler } from "@/lib/jobs/types";
import { expandWardYear } from "@/lib/ifms/downloader";
import "@/lib/sources/adapters"; // registers every adapter
import { getSourceAdapter } from "@/lib/sources/registry";
import { ingestFacts } from "@/lib/sources/ingest";

export interface SourceFetchJobInput {
  wardYear: string; // "ddd-yy"
}

const handler: JobHandler = async (ctx) => {
  const input = ctx.input as SourceFetchJobInput;
  const admin = ctx.admin;
  const ifms = getSourceAdapter("bbmp_ifms");
  if (!ifms) return { error: "IFMS adapter not registered" };

  const jobCodes = await expandWardYear(input.wardYear, {
    onProbe: (serial, hit) => {
      void ctx.updateProgress(
        Math.min(99, Math.round((serial / 200) * 100)),
        "scanning",
        `Checked serial ${serial}${hit ? " — found" : ""}…`,
      );
    },
  });

  let ingested = 0;
  let failed = 0;
  for (let i = 0; i < jobCodes.length; i++) {
    if (await ctx.isCancelled()) break;
    const jobCode = jobCodes[i]!;
    await ctx.updateProgress(
      Math.round(((i + 1) / jobCodes.length) * 100),
      "ingesting",
      `Ingesting ${jobCode} (${i + 1} of ${jobCodes.length})…`,
    );
    try {
      const result = await ifms.search({ jobNumber: jobCode });
      if (result.ok && result.citation) {
        await ingestFacts(admin, { jobNumber: jobCode, facts: result.facts, citation: result.citation, userId: ctx.userId });
        ingested++;
      }
    } catch (e) {
      console.error("[source_fetch]", jobCode, e);
      failed++;
    }
  }

  return { result: { wardYear: input.wardYear, jobCodesFound: jobCodes.length, ingested, failed } };
};

registerJobHandler("source_fetch", handler);
