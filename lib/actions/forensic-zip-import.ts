"use server";

import { revalidatePath } from "next/cache";
import { requireRole, AuthorizationError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { commitForensicJobs } from "@/lib/forensic/commit-runner";
import { COMPLAINT_FIELD_ROLES, COMPLAINT_WRITE_ROLES } from "@/lib/constants";
import type { CommitForensicResult, ForensicImportBatch, ForensicJobResult } from "@/lib/forensic/skill-output";

/** Poll/resume a forensic import batch by id (also used after a page refresh). */
export async function getForensicImportBatchAction(batchId: string): Promise<ForensicImportBatch> {
  try {
    await requireRole(COMPLAINT_FIELD_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  if (!batchId) return { error: "Missing batch id" };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("forensic_import_batches")
    .select("id, status, extract_dir, folder_count, jobs, created_case_ids, created_complaint_ids, error")
    .eq("id", batchId)
    .single();
  if (error || !data) return { error: "Import not found — it may have expired. Please re-upload." };

  return {
    success: true,
    batchId: data.id as string,
    status: data.status as ForensicImportBatch["status"],
    extractDir: data.extract_dir as string,
    folderCount: (data.folder_count as number) ?? 0,
    jobs: (data.jobs as ForensicJobResult[]) ?? [],
    createdCaseIds: (data.created_case_ids as string[]) ?? [],
    createdComplaintIds: (data.created_complaint_ids as string[]) ?? [],
    error: (data.error as string) ?? undefined,
  };
}

/**
 * Commit a reviewed forensic import. Thin auth wrapper — the whole pipeline
 * (job_case upsert → R2 upload → skill-JSON mapping → complaint creation →
 * letter attach) lives in lib/forensic/commit-runner.ts so the background
 * import worker can run the same code outside a request scope.
 */
export async function commitForensicImportAction(params: {
  batchId: string;
  jobs: ForensicJobResult[];
}): Promise<CommitForensicResult> {
  let user;
  try {
    user = await requireRole(COMPLAINT_WRITE_ROLES);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const admin = createAdminClient();

  const { data: batch } = await admin
    .from("forensic_import_batches")
    .select("id, extract_dir")
    .eq("id", params.batchId)
    .single();
  if (!batch?.extract_dir) return { error: "Import batch not found — please re-upload." };

  const result = await commitForensicJobs(admin, {
    batchId: params.batchId,
    tempDirPath: batch.extract_dir as string,
    jobs: params.jobs,
    userId: user.id,
  });

  revalidatePath("/complaints");
  revalidatePath("/complaints/import");
  revalidatePath("/complaints/duplicate-photos");
  return result;
}
