/**
 * Work-progress status. getWorkStatus is only a fallback/default used when a
 * bbmp_work row has no explicit work_status set (e.g. a bare progress-
 * percentage fact with no richer status known yet) — it can never express
 * states like "Tender Pending" or "Payment Partially Completed" on its own.
 * bbmp_works.work_status is a free column normally set by whichever source
 * wrote the row; see WORK_STATUSES (lib/constants.ts) for the full list.
 *
 * This is unrelated to job_cases.status, which is a case-workflow state
 * (downloaded | audited | converted) for the separate forensic-ZIP pipeline
 * — the two are never unified or copied into each other.
 */

export function getWorkStatus(
  progressPercentage: number | null | undefined,
): "Not Started" | "In Progress" | "Completed" | "Status Unknown" {
  if (progressPercentage == null || Number.isNaN(progressPercentage)) return "Status Unknown";
  if (progressPercentage === 0) return "Not Started";
  if (progressPercentage > 0 && progressPercentage < 100) return "In Progress";
  if (progressPercentage === 100) return "Completed";
  return "Status Unknown";
}

/** work_status if explicitly set, else derived from progress_percentage. */
export function resolveWorkStatus(
  explicitStatus: string | null | undefined,
  progressPercentage: number | null | undefined,
): string {
  return explicitStatus?.trim() || getWorkStatus(progressPercentage);
}
