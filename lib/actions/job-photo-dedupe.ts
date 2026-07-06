"use server";

import { requireRole, AuthorizationError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMPLAINT_VERIFY_ROLES } from "@/lib/constants";
import { startJob } from "@/lib/jobs/runner";
// Side-effect import: registers the "vision_scan" job handler.
import "@/lib/jobs/handlers";

/**
 * On-demand VISUAL duplicate scan for one division (the print→scan case) —
 * starts a background job and returns immediately (up to 60 sequential
 * vision-API calls previously blocked this action for potentially minutes).
 * The caller (components/forensic/visual-dup-scan.tsx) polls getJobAction()
 * for live progress + the final VisualScanResult in job.result.
 */
export async function scanDivisionVisualDuplicatesAction(division: string): Promise<{ ok: boolean; jobId?: string; error?: string }> {
  let user;
  try {
    user = await requireRole(COMPLAINT_VERIFY_ROLES);
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  if (!division) return { ok: false, error: "No division specified." };

  const admin = createAdminClient();
  return startJob(admin, {
    type: "vision_scan",
    title: `Visual duplicate scan — ${division}`,
    // entity_id is a uuid column and a division here is a plain name string
    // (job_cases.division — not a foreign key to the divisions table), so it
    // can't be the dedupe key the way every other job type's real UUID
    // entity is. Left null on purpose: the duplicate-prevention unique index
    // doesn't cover this job type (Postgres treats every NULL as distinct,
    // so it wouldn't actually dedupe even if the column accepted the string).
    // Low-risk gap — double-clicking "Scan" starts two jobs rather than
    // reconnecting to one, not a correctness issue for the scan itself.
    input: { division },
    userId: user.id,
  });
}
