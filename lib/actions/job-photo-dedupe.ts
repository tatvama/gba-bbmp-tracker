"use server";

import { requireRole, AuthorizationError } from "@/lib/auth";
import { COMPLAINT_VERIFY_ROLES } from "@/lib/constants";
import { scanDivisionVisualDuplicates, type VisualScanResult } from "@/lib/forensic/job-photo-dedupe";

/** On-demand VISUAL duplicate scan for one division (the print→scan case). */
export async function scanDivisionVisualDuplicatesAction(division: string): Promise<VisualScanResult> {
  const fail = (error: string): VisualScanResult => ({ ok: false, comparisons: 0, cached: 0, matches: [], capped: false, error });
  try {
    await requireRole(COMPLAINT_VERIFY_ROLES);
  } catch (e) {
    return fail(e instanceof AuthorizationError ? e.message : "Not authorized");
  }
  if (!division) return fail("No division specified.");
  try {
    return await scanDivisionVisualDuplicates(division);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Visual scan failed");
  }
}
