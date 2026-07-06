import type { JobType } from "./types";

/**
 * Per-type presentation rules used ONCE, server-side, when a raw
 * background_jobs row is normalized into a TaskItem (lib/jobs/adapters.ts) —
 * the client never recomputes these; it just reads TaskItem.module /
 * .resultLink / .cancellable directly. Kept in its own file (not registry.ts,
 * which is about DISPATCH config) purely for organization.
 */

/** Job types whose handler actually checks ctx.isCancelled() at a meaningful
 *  point. Honest on purpose: a Cancel button only renders for a type in this
 *  list. ai_draft/ocr are a single streaming/OCR call with no clean midpoint
 *  to stop, so they're deliberately absent — vision_scan checks between every
 *  photo pair, ifms_download checks between every job code. */
export const CANCELLABLE_JOB_TYPES: JobType[] = ["vision_scan", "ifms_download"];

export const MODULE_LABEL: Record<JobType, string> = {
  ai_draft: "AI Drafting",
  ocr: "OCR",
  vision_scan: "Vision Scan",
  export: "Export",
  ifms_download: "IFMS Download",
};

/** Where "Open Result" should take the user once a background_jobs-sourced
 *  task is done. */
export function resultLinkForRow(type: string, entityType: string | null, entityId: string | null): string | null {
  switch (type as JobType) {
    case "ai_draft":
      return entityType === "complaint" && entityId ? `/complaints/${entityId}?tab=ai` : null;
    case "ocr":
    case "export":
      return entityType === "complaint" && entityId ? `/complaints/${entityId}` : null;
    case "vision_scan":
      return "/complaints/duplicate-photos";
    case "ifms_download":
      return "/complaints/portal";
    default:
      return null;
  }
}

export function moduleLabelForType(type: string): string {
  return MODULE_LABEL[type as JobType] ?? type;
}

export function isCancellableType(type: string, status: string): boolean {
  return CANCELLABLE_JOB_TYPES.includes(type as JobType) && (status === "running" || status === "queued" || status === "retrying");
}
