import "server-only";
/**
 * The "ocr" job handler. processDocumentOcr's internals (download, preprocess,
 * OCR, upload processed image/thumbnail, its own ocr_jobs bookkeeping) are
 * completely untouched — this only changes HOW it's invoked: a route handler
 * used to await it inline (dying if the user navigated away mid-request);
 * now it runs inside the generic background-job runner instead.
 */
import { registerJobHandler } from "@/lib/jobs/registry";
import type { JobHandler } from "@/lib/jobs/types";
import { processDocumentOcr } from "@/lib/ocr/process-document";

export interface OcrJobInput {
  documentId: string;
  analyze?: boolean;
}

const handler: JobHandler = async (ctx) => {
  const input = ctx.input as OcrJobInput;

  // Purely for the Task Center's "Open Result" link — processDocumentOcr does
  // its own (separate) lookup of the same row; this doesn't change its logic.
  const { data: doc } = await ctx.admin.from("complaint_documents").select("complaint_id").eq("id", input.documentId).maybeSingle();
  const complaintId = (doc?.complaint_id as string | null) ?? null;

  await ctx.updateProgress(20, "ocr", "Reading the document…");
  const r = await processDocumentOcr(input.documentId, { analyze: input.analyze });
  await ctx.updateProgress(90, "ocr", "Saving results…");

  if (!r.ok) {
    return { error: r.error ?? "OCR failed" };
  }
  return { result: { status: r.status, complaintId } };
};

registerJobHandler("ocr", handler);
