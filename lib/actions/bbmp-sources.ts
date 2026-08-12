"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/db";
import { requireRole, AuthorizationError } from "@/lib/auth";
import { WRITE_ROLES } from "@/lib/constants";
import { startJob } from "@/lib/jobs/runner";
import "@/lib/sources/adapters";
import { getSourceAdapter } from "@/lib/sources/registry";
import { ingestFacts } from "@/lib/sources/ingest";
import type { ActionState } from "@/lib/actions/contacts";

/** Single job-code IFMS lookup — a few fast HTTP round trips, so this stays
 *  synchronous (no background job needed; see source_fetch's own docstring
 *  for why bulk ward+year expansion is the only case that needs one). */
export async function refreshWorkFromIfms(jobNumber: string): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }

  const ifms = getSourceAdapter("bbmp_ifms");
  if (!ifms) return { error: "IFMS adapter not available." };

  const result = await ifms.search({ jobNumber });
  if (!result.ok) return { error: result.error ?? "Could not reach the BBMP IFMS portal." };
  if (!result.citation) return { error: `No record found on BBMP IFMS for job ${jobNumber}.` };

  const admin = createAdminClient();
  try {
    const workId = await ingestFacts(admin, {
      jobNumber,
      facts: result.facts,
      citation: result.citation,
      userId: user.id,
    });
    revalidatePath(`/bbmp-works/job/${jobNumber}`);
    return { success: true, id: workId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save the fetched data." };
  }
}

/** Bulk ward+year IFMS expansion — runs as a background job (can walk up to
 *  2000 serials; see lib/jobs/handlers/source-fetch.ts). */
export async function startBulkIfmsFetch(wardYear: string): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }

  const admin = createAdminClient();
  const { ok, jobId, error } = await startJob(admin, {
    type: "source_fetch",
    title: `BBMP IFMS fetch — ward/year ${wardYear}`,
    input: { wardYear },
    userId: user.id,
    link: "/bbmp-works/search",
  });
  if (!ok) return { error: error ?? "Could not start the fetch." };
  return { success: true, id: jobId };
}
