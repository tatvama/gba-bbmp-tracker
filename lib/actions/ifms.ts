"use server";

import { revalidatePath } from "next/cache";
import { requireRole, AuthorizationError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadBuffer, buildPath } from "@/lib/storage/supabase-upload";
import { fingerprintImage } from "@/lib/ocr/image-fingerprint";
import { processQueuedJobDocs } from "@/lib/ocr/process-job-document";
import { COMPLAINT_FIELD_ROLES, COMPLAINT_WRITE_ROLES, STORAGE_BUCKETS } from "@/lib/constants";
import { getComplaintSettings } from "@/lib/settings";
import {
  checkPortalReachable,
  resolveTargets,
  expandWardYear,
  getJobFiles,
  downloadFile,
  DownloadError,
  type PortalFile,
} from "@/lib/ifms/downloader";

/** Split a free-text targets box into chunks (commas / newlines; spaces kept). */
function splitTargets(raw: string): string[] {
  return String(raw || "")
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Resolve loose input to the concrete job codes that exist on the portal. */
async function resolveJobCodes(
  rawTargets: string[],
  onProbe?: (n: number, hit: boolean) => void,
): Promise<{ codes: string[]; invalid: string[]; kind: string }> {
  const { targets, invalid } = resolveTargets(rawTargets);
  const codes: string[] = [];
  const kinds = new Set<string>();
  for (const t of targets) {
    kinds.add(t.kind);
    if (t.kind === "code") {
      codes.push(t.value);
    } else {
      const found = await expandWardYear(t.value, { onProbe });
      codes.push(...found);
    }
  }
  // De-dup while preserving order.
  const seen = new Set<string>();
  const unique = codes.filter((c) => (seen.has(c) ? false : (seen.add(c), true)));
  return { codes: unique, invalid, kind: kinds.size > 1 ? "mixed" : [...kinds][0] ?? "code" };
}

export interface PreviewJob {
  jobCode: string;
  exists: boolean;
  fileCount: number;
}
export interface PreviewResult {
  ok: boolean;
  jobs?: PreviewJob[];
  totalFiles?: number;
  invalid?: string[];
  error?: string;
}

/**
 * DRY RUN: resolve targets and report the jobs + file counts that WOULD download.
 * Writes nothing. Walks ward+year serials (bounded by stopAfterMisses) and counts
 * files per job. Can be slow for a whole ward+year — that enumeration is inherent.
 */
export async function previewIfmsDownload(input: { targets: string }): Promise<PreviewResult> {
  try {
    await requireRole(COMPLAINT_FIELD_ROLES);
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }

  const reach = await checkPortalReachable();
  if (!reach.ok) return { ok: false, error: reach.error };

  const rawTargets = splitTargets(input.targets);
  if (!rawTargets.length) return { ok: false, error: "Enter at least one job code or ward+year." };

  const { codes, invalid } = await resolveJobCodes(rawTargets);
  if (!codes.length) {
    return { ok: false, error: "No matching jobs found on the portal for that selection.", invalid };
  }

  const jobs: PreviewJob[] = [];
  let totalFiles = 0;
  for (const jobCode of codes) {
    const jf = await getJobFiles(jobCode);
    jobs.push({ jobCode, exists: jf.exists, fileCount: jf.files.length });
    totalFiles += jf.files.length;
  }
  return { ok: true, jobs, totalFiles, invalid };
}

export interface StartRunResult {
  ok: boolean;
  runId?: string;
  codes?: string[];
  error?: string;
}

/**
 * Create a download run. Pass the previewed `codes` to skip re-walking; otherwise the
 * targets are resolved again. The actual downloading happens per-job via
 * downloadNextJob(runId), so a long ward+year run is resumable and shows progress.
 */
export async function startIfmsDownloadRun(input: { targets: string; codes?: string[] }): Promise<StartRunResult> {
  let user;
  try {
    user = await requireRole(COMPLAINT_FIELD_ROLES);
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const admin = createAdminClient();

  let codes = input.codes ?? [];
  let kind = "code";
  if (!codes.length) {
    const reach = await checkPortalReachable();
    if (!reach.ok) return { ok: false, error: reach.error };
    const resolved = await resolveJobCodes(splitTargets(input.targets));
    codes = resolved.codes;
    kind = resolved.kind;
  }
  if (!codes.length) return { ok: false, error: "No jobs to download." };

  const { data, error } = await admin
    .from("job_download_runs")
    .insert({
      selector_kind: kind,
      selector_value: input.targets,
      status: "running",
      codes,
      cursor: 0,
      jobs_found: codes.length,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not start the download run." };

  return { ok: true, runId: data.id as string, codes };
}

export interface DownloadStepResult {
  ok: boolean;
  done: boolean;
  jobCode?: string;
  jobCaseId?: string;
  filesDownloaded: number;
  filesFailed: number;
  cursor: number;
  total: number;
  jobsDone: number;
  error?: string;
}

/**
 * Process ONE job of a run: fetch its file list, download each file into the
 * job-documents bucket, and create job_documents rows (Queued for OCR). Resumable —
 * a file already stored (same job + filename) is skipped. The client calls this in a
 * loop until `done` is true.
 */
export async function downloadNextJob(runId: string): Promise<DownloadStepResult> {
  let user;
  try {
    user = await requireRole(COMPLAINT_FIELD_ROLES);
  } catch (e) {
    return { ok: false, done: true, filesDownloaded: 0, filesFailed: 0, cursor: 0, total: 0, jobsDone: 0, error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const admin = createAdminClient();

  const { data: run } = await admin.from("job_download_runs").select("*").eq("id", runId).single();
  if (!run) return { ok: false, done: true, filesDownloaded: 0, filesFailed: 0, cursor: 0, total: 0, jobsDone: 0, error: "Run not found" };

  const codes: string[] = Array.isArray(run.codes) ? (run.codes as string[]) : [];
  const cursor: number = run.cursor ?? 0;
  const total = codes.length;

  if (cursor >= total) {
    await admin.from("job_download_runs").update({ status: "done" }).eq("id", runId);
    return { ok: true, done: true, filesDownloaded: run.files_downloaded ?? 0, filesFailed: run.files_failed ?? 0, cursor, total, jobsDone: run.jobs_done ?? 0 };
  }

  const jobCode = codes[cursor]!;
  let filesDownloaded = 0;
  let filesFailed = 0;
  const logEntry: { jobCode: string; files: number; failed: number; note?: string } = { jobCode, files: 0, failed: 0 };

  try {
    const jf = await getJobFiles(jobCode);

    // Upsert the job case (parent container) up front so documents have a home.
    const [ward, year, serial] = jobCode.split("-");
    const { data: jc } = await admin
      .from("job_cases")
      .upsert(
        {
          job_number: jobCode,
          ward,
          year,
          serial,
          description: jf.meta.description || null,
          wo_ref: jf.meta.woRef || null,
          bill_ids: jf.meta.billIds || null,
          source: "ifms_portal",
          status: "downloaded",
          download_run_id: runId,
          created_by: user.id,
        },
        { onConflict: "job_number" },
      )
      .select("id")
      .single();
    const jobCaseId = jc?.id as string | undefined;

    if (!jf.exists || !jobCaseId) {
      logEntry.note = jf.exists ? "could not create job case" : "no bills on portal";
    } else {
      // Which files already exist for this job (resume)?
      const { data: existing } = await admin
        .from("job_documents")
        .select("original_file_name")
        .eq("job_number", jobCode);
      const have = new Set((existing ?? []).map((r) => r.original_file_name as string));

      for (const file of jf.files as PortalFile[]) {
        if (have.has(file.name)) {
          continue; // already downloaded
        }
        try {
          const body = await downloadFile(file.url, { expectPdf: file.name.toLowerCase().endsWith(".pdf") });
          const mime = file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg";
          const path = buildPath(jobCaseId, file.name, Date.now(), Math.random().toString(36).slice(2, 8));
          await uploadBuffer({ bucket: STORAGE_BUCKETS.jobDocuments, path, body, contentType: mime });

          const fp = await fingerprintImage(body, mime).catch(() => null);
          await admin.from("job_documents").insert({
            job_case_id: jobCaseId,
            job_number: jobCode,
            document_type: file.docType,
            original_file_name: file.name,
            title: file.name,
            storage_bucket: STORAGE_BUCKETS.jobDocuments,
            storage_path: path,
            mime_type: mime,
            file_size: body.byteLength,
            source: "ifms_portal",
            is_blank_template: file.isBlankTemplate,
            ocr_status: "Queued",
            ocr_language: "eng+kan",
            file_sha256: fp?.sha256 ?? null,
            phash: fp?.phash ?? null,
            dhash: fp?.dhash ?? null,
            exif_gps_lat: fp?.gpsLat ?? null,
            exif_gps_lon: fp?.gpsLon ?? null,
            exif_taken_at: fp?.takenAt ?? null,
            created_by: user.id,
          });
          filesDownloaded++;
        } catch (e) {
          filesFailed++;
          if (!(e instanceof DownloadError)) console.error("[ifms] download failed", jobCode, file.name, e);
        }
      }

      // Keep the job case's file_count in sync.
      const { count } = await admin
        .from("job_documents")
        .select("id", { count: "exact", head: true })
        .eq("job_case_id", jobCaseId);
      await admin.from("job_cases").update({ file_count: count ?? 0 }).eq("id", jobCaseId);
      logEntry.files = filesDownloaded;
      logEntry.failed = filesFailed;
    }

    // Advance the run cursor + counters.
    const log = Array.isArray(run.log) ? (run.log as unknown[]) : [];
    const nextCursor = cursor + 1;
    await admin
      .from("job_download_runs")
      .update({
        cursor: nextCursor,
        jobs_done: (run.jobs_done ?? 0) + 1,
        files_downloaded: (run.files_downloaded ?? 0) + filesDownloaded,
        files_failed: (run.files_failed ?? 0) + filesFailed,
        log: [...log, logEntry].slice(-500),
        status: nextCursor >= total ? "done" : "running",
      })
      .eq("id", runId);

    revalidatePath("/complaints/portal");
    return {
      ok: true,
      done: nextCursor >= total,
      jobCode,
      jobCaseId,
      filesDownloaded,
      filesFailed,
      cursor: nextCursor,
      total,
      jobsDone: (run.jobs_done ?? 0) + 1,
    };
  } catch (e) {
    // Don't abort the whole run on one job's failure — advance past it.
    const log = Array.isArray(run.log) ? (run.log as unknown[]) : [];
    const nextCursor = cursor + 1;
    await admin
      .from("job_download_runs")
      .update({
        cursor: nextCursor,
        jobs_done: (run.jobs_done ?? 0) + 1,
        log: [...log, { jobCode, files: 0, failed: 0, note: e instanceof Error ? e.message : "job failed" }].slice(-500),
        status: nextCursor >= total ? "done" : "running",
      })
      .eq("id", runId);
    return {
      ok: true,
      done: nextCursor >= total,
      jobCode,
      filesDownloaded,
      filesFailed,
      cursor: nextCursor,
      total,
      jobsDone: (run.jobs_done ?? 0) + 1,
      error: e instanceof Error ? e.message : "Job failed",
    };
  }
}

export interface OcrBatchResult {
  ok: boolean;
  processed?: number;
  remaining?: number;
  errors?: number;
  error?: string;
}

/**
 * OCR a batch of a job case's queued documents (UI loops until remaining === 0).
 * `analyze` also runs the text AI summariser (optional, env-gated).
 */
export async function runJobDocsOcrBatch(jobCaseId: string, opts?: { analyze?: boolean }): Promise<OcrBatchResult> {
  try {
    await requireRole(COMPLAINT_FIELD_ROLES);
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  try {
    const r = await processQueuedJobDocs(jobCaseId, { max: 3, analyze: opts?.analyze });
    revalidatePath("/complaints/portal");
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "OCR batch failed" };
  }
}

export interface ConvertResult {
  ok: boolean;
  complaintId?: string;
  caseNumber?: string;
  error?: string;
}

/**
 * Convert a downloaded job case into a complaint. The complaint carries the same
 * job_number, so the existing forensic audit + letter pages immediately cover its
 * documents — no copying needed. Idempotent: if already converted, returns the
 * existing complaint.
 */
export async function convertJobCaseToComplaint(jobCaseId: string): Promise<ConvertResult> {
  let user;
  try {
    user = await requireRole(COMPLAINT_WRITE_ROLES);
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const admin = createAdminClient();

  const { data: jc } = await admin.from("job_cases").select("*").eq("id", jobCaseId).single();
  if (!jc) return { ok: false, error: "Job case not found." };

  // Already converted → return the existing complaint (idempotent).
  if (jc.complaint_id) {
    const { data: existing } = await admin.from("complaints").select("internal_case_number").eq("id", jc.complaint_id).maybeSingle();
    return { ok: true, complaintId: jc.complaint_id as string, caseNumber: (existing?.internal_case_number as string) ?? undefined };
  }

  const settings = await getComplaintSettings();
  const year = new Date().getFullYear();
  const { data: rpc, error: rpcError } = await admin.rpc("next_complaint_case_number", {
    p_prefix: settings.caseNumberPrefix || "DM-CMP",
    p_year: year,
  });
  if (rpcError || !rpc) return { ok: false, error: `Could not generate a case number: ${rpcError?.message ?? "unknown"}` };
  const caseNumber = rpc as string;

  const jobNumber = jc.job_number as string;
  const title = (jc.description as string)?.trim() || `BBMP works job ${jobNumber}`;
  const { data: comp, error } = await admin
    .from("complaints")
    .insert({
      title: title.slice(0, 300),
      type: "Tender Irregularity",
      status: "Draft",
      priority: "Medium",
      job_number: jobNumber,
      internal_case_number: caseNumber,
      complaint_mode: "Online portal",
      description: `Imported from the BBMP IFMS portal (job ${jobNumber}). Contractor: ${jc.contractor ?? "—"}. Documents downloaded and audited under this job number; draft the bill-stop / complaint letter from the forensic audit.`,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();
  if (error || !comp) return { ok: false, error: error?.message ?? "Could not create the complaint." };
  const complaintId = comp.id as string;

  await admin.from("job_cases").update({ complaint_id: complaintId, status: "converted" }).eq("id", jobCaseId);
  await admin.from("complaint_timeline").insert({
    complaint_id: complaintId,
    event_type: "Created",
    title: "Complaint created from BBMP portal job",
    summary: `${caseNumber} — job ${jobNumber}`,
    created_by: user.id,
  });

  revalidatePath("/complaints/portal");
  revalidatePath("/complaints");
  return { ok: true, complaintId, caseNumber };
}
