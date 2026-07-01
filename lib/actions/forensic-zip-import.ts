"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { readFile } from "node:fs/promises";
import { requireRole, AuthorizationError } from "@/lib/auth";
import { scanDivisionVisualDuplicates } from "@/lib/forensic/job-photo-dedupe";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadToR2 } from "@/lib/storage/r2-upload";
import { walkTempDir, deleteTempDir, type TempDirFile } from "@/lib/forensic/zip";
import { mapWithConcurrency } from "@/lib/utils/concurrency";
import { COMPLAINT_FIELD_ROLES, COMPLAINT_WRITE_ROLES, R2_STORAGE_SENTINEL } from "@/lib/constants";
import { classifyRelPath, forensicR2SubPath } from "@/lib/forensic/parse-skill-output";
import { extractJobCode, mapPortalFileToDocType, isBlankTemplate } from "@/lib/ifms/downloader";
import {
  datasetToAuditReport,
  auditRowFromReport,
  datasetToRunningBillRows,
  datasetToTimelineRows,
  datasetToJobCasePatch,
} from "@/lib/forensic/json-to-audit";
import { fingerprintImage } from "@/lib/ocr/image-fingerprint";
import { convertJobCaseToComplaint } from "@/lib/actions/ifms";
import { notifyUser } from "@/lib/notifications";
import type {
  CommitForensicResult,
  ForensicFileRole,
  ForensicImportBatch,
  ForensicJobResult,
} from "@/lib/forensic/skill-output";

const MAX_FILES_PER_JOB = 300;
const UPLOAD_CONCURRENCY = 6; // bounded parallel R2 uploads per job; I/O-bound, no reason for full sequential
/** R2 top-level folder for every forensic-ZIP-imported file: complaints/<job-number>/... */
const R2_FOLDER_PREFIX = "complaints";

function mimeFor(name: string): string {
  const ext = (name.split(".").pop() || "").toLowerCase();
  switch (ext) {
    case "pdf": return "application/pdf";
    case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "json": return "application/json";
    case "csv": return "text/csv";
    case "txt":
    case "log": return "text/plain";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "webp": return "image/webp";
    default: return "application/octet-stream";
  }
}

function docTypeForRole(role: ForensicFileRole, base: string): string {
  switch (role) {
    case "portal_pdf": return mapPortalFileToDocType(base);
    case "min_json":
    case "rich_json": return "Forensic dataset (JSON)";
    case "text": return "Extracted text";
    case "info": return "Portal info";
    case "evidence_csv": return "Evidence index";
    case "log": return "Forensic log";
    case "letter_docx": return "Generated complaint letter";
    case "letter_pdf": return "Generated complaint letter (PDF)";
    default: return "Other evidence";
  }
}

function baseName(p: string): string {
  return p.split("/").pop() || p;
}

/**
 * Resolve the structured ward/division/sub-division FKs for a complaint from the
 * job code's ward number, so imported complaints are trackable by Ward / Division
 * / Sub-division. The ward's own division_id/eng_subdivision_id FK columns are the
 * PRIMARY source — they're the app's current, authoritative org master and always
 * agree with the Ward filter shown elsewhere in the UI. The skill's free-text
 * division/sub_division fields describe the *original tender-era BBMP engineering
 * division* (e.g. "Bangalore South Division (South-1)") — a different, older
 * naming scheme that routinely has no match in this app's `divisions` table (it
 * names today's GBA-era divisions, e.g. "Uttarahalli") — so that text is only a
 * fallback for wards whose own master row hasn't been assigned a division yet.
 * Best-effort throughout: anything that doesn't resolve is left null.
 */
async function resolveOrgIds(
  admin: ReturnType<typeof createAdminClient>,
  dataset: { division?: string | null; sub_division?: string | null } | null | undefined,
  jobCode: string,
): Promise<{ division_id: string | null; eng_subdivision_id: string | null; ward_id: string | null }> {
  let division_id: string | null = null;
  let eng_subdivision_id: string | null = null;
  let ward_id: string | null = null;

  const wardNo = parseInt(jobCode.split("-")[0] ?? "", 10);
  if (Number.isFinite(wardNo)) {
    const { data } = await admin
      .from("wards")
      .select("id, division_id, eng_subdivision_id")
      .eq("new_no", wardNo)
      .limit(1);
    const ward = data?.[0];
    ward_id = (ward?.id as string) ?? null;
    division_id = (ward?.division_id as string) ?? null;
    eng_subdivision_id = (ward?.eng_subdivision_id as string) ?? null;
  }

  if (!division_id) {
    const divName = dataset?.division?.trim();
    if (divName) {
      const { data } = await admin.from("divisions").select("id").ilike("name", divName).limit(1);
      division_id = (data?.[0]?.id as string) ?? null;
    }
  }
  if (!eng_subdivision_id) {
    const subName = dataset?.sub_division?.trim();
    if (subName) {
      let q = admin.from("eng_subdivisions").select("id").ilike("name", subName);
      if (division_id) q = q.eq("division_id", division_id);
      const { data } = await q.limit(1);
      eng_subdivision_id = (data?.[0]?.id as string) ?? null;
    }
  }
  return { division_id, eng_subdivision_id, ward_id };
}

/**
 * Best-effort default officer for a resolved eng_subdivision: the contact most
 * specifically named as responsible in these audits — "Executive Engineer" /
 * "Assistant Executive Engineer" of the subdivision (this is literally who the
 * skill's own grounds[].officer text names for subdivision-level oversight).
 * Falls back to any other contact at that subdivision. Returns nulls (never
 * throws) when no contact is mapped yet — the contacts directory is filled in
 * over time and most subdivisions have no entry yet.
 */
async function resolveAssignedEngineer(
  admin: ReturnType<typeof createAdminClient>,
  engSubdivisionId: string | null,
): Promise<{ assigned_engineer_id: string | null; responsible_department: string | null }> {
  if (!engSubdivisionId) return { assigned_engineer_id: null, responsible_department: null };
  const { data } = await admin
    .from("contacts")
    .select("id, designation, department")
    .eq("eng_subdivision_id", engSubdivisionId);
  const contacts = data ?? [];
  if (!contacts.length) return { assigned_engineer_id: null, responsible_department: null };

  const rank = (designation: string | null) => {
    const d = (designation ?? "").toLowerCase();
    if (d.includes("executive engineer") && !d.includes("assistant")) return 0;
    if (d.includes("assistant executive engineer")) return 1;
    if (d.includes("ward engineer")) return 2;
    return 3;
  };
  const best = [...contacts].sort((a, b) => rank(a.designation as string) - rank(b.designation as string))[0]!;
  return {
    assigned_engineer_id: (best.id as string) ?? null,
    responsible_department: (best.department as string) ?? null,
  };
}

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
 * Commit a reviewed forensic import. Reads from the LOCAL TEMP DIR the route
 * handler extracted into (never re-fetches anything — we're reading our own
 * server-side extraction of the original upload, never touched by the client
 * after that point). For each selected, valid-code job: upserts a job_case,
 * uploads its files to R2 (preserving the skill's own data/letters/work
 * sub-path — see forensicR2SubPath), maps the skill JSON into job_audits +
 * side tables (no engine re-run), converts the job case to a Complaint, and
 * attaches the skill's letter as the printable letter. Bare R2 object keys
 * only in storage_path (never a full URL) — see R2_STORAGE_SENTINEL for the
 * discriminator against legacy Supabase rows.
 */
export async function commitForensicImportAction(params: {
  batchId: string;
  jobs: ForensicJobResult[];
}): Promise<CommitForensicResult> {
  const startedAt = Date.now();
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
  const tempDirPath = batch.extract_dir as string;

  console.log(`[commitForensicImportAction] started batch=${params.batchId} user=${user.id} ts=${new Date(startedAt).toISOString()}`);

  const files = await walkTempDir(tempDirPath);
  if (files.length === 0) {
    return { error: "The extracted files for this import are no longer available (the server may have restarted) — please re-upload the ZIP." };
  }

  const byCode = new Map<string, TempDirFile[]>();
  for (const f of files) {
    const code = extractJobCode(f.relPath);
    if (!code) continue;
    (byCode.get(code) ?? byCode.set(code, []).get(code)!).push(f);
  }

  const selected = params.jobs.filter((j) => !j.skip && j.validCode);
  if (!selected.length) return { error: "No job folders selected to import." };

  const perJob: NonNullable<CommitForensicResult["perJob"]> = [];
  const createdCaseIds: string[] = [];
  const createdComplaintIds: string[] = [];
  let totalFiles = 0, totalUploaded = 0, totalFailed = 0, totalSkipped = 0;

  for (const job of selected) {
    const code = job.jobCode;
    const jobFiles = byCode.get(code);
    if (!jobFiles) {
      perJob.push({ jobCode: code, error: "No files found for this job code in the extracted temp dir." });
      continue;
    }
    try {
      const [ward, year, serial] = code.split("-");

      // 1) Upsert the job_case (only non-null forensic fields, to avoid clobbering portal data).
      const caseRow: Record<string, unknown> = {
        job_number: code,
        ward,
        year,
        serial,
        source: "forensic_zip",
        status: "audited",
        created_by: user.id,
      };
      if (job.dataset) {
        for (const [k, v] of Object.entries(datasetToJobCasePatch(job.dataset))) {
          if (v != null) caseRow[k] = v;
        }
      }
      const { data: jc, error: jcErr } = await admin
        .from("job_cases")
        .upsert(caseRow, { onConflict: "job_number" })
        .select("id")
        .single();
      if (jcErr || !jc) throw new Error(jcErr?.message || "Could not create the job case.");
      const jobCaseId = jc.id as string;

      // 2) Upload files → R2 (bounded concurrency; per-file try/catch so one
      // file's failure never aborts the job or the batch).
      //
      // Dedup is R2-AWARE, not just name-aware: skip a file only if it already
      // has an R2-backed row. A file that exists only as a legacy row (e.g. an
      // earlier import that stored to Supabase Storage, storage_bucket
      // "job-documents") is re-uploaded to R2 and its row migrated in place —
      // otherwise switching to R2-only storage would skip every previously
      // imported file forever and R2 would stay empty.
      const { data: existingDocs } = await admin
        .from("job_documents")
        .select("id, original_file_name, storage_bucket")
        .eq("job_number", code);
      const r2Have = new Set(
        (existingDocs ?? [])
          .filter((r) => r.storage_bucket === R2_STORAGE_SENTINEL)
          .map((r) => r.original_file_name as string),
      );
      const legacyRowIdByName = new Map<string, string>();
      for (const r of existingDocs ?? []) {
        const name = r.original_file_name as string;
        if (r.storage_bucket !== R2_STORAGE_SENTINEL && !legacyRowIdByName.has(name)) {
          legacyRowIdByName.set(name, r.id as string);
        }
      }

      const candidates = jobFiles
        .slice(0, MAX_FILES_PER_JOB)
        .filter((f) => classifyRelPath(f.relPath) !== "other" && !r2Have.has(baseName(f.relPath)));
      totalFiles += candidates.length;
      totalSkipped += jobFiles.length - candidates.length;

      // Pre-scan letter attachment targets from ALL job files (not just the
      // upload candidates): the R2 key is deterministic, so the letter must be
      // attached to the complaint even when it was already uploaded on a prior
      // run (and thus deduped out of `candidates`) — otherwise a re-imported
      // complaint would show no letter.
      let letterDocxPath: { name: string; key: string; subPath: string; mime: string; size: number } | null = null;
      let letterPdfPath: { name: string; key: string; subPath: string; mime: string; size: number } | null = null;
      for (const f of jobFiles.slice(0, MAX_FILES_PER_JOB)) {
        const role = classifyRelPath(f.relPath);
        if (role !== "letter_docx" && role !== "letter_pdf") continue;
        const name = baseName(f.relPath);
        const subPath = forensicR2SubPath(f.relPath, code);
        const entry = { name, key: `${R2_FOLDER_PREFIX}/${code}/${subPath}`, subPath, mime: mimeFor(name), size: f.size };
        if (role === "letter_docx" && !letterDocxPath) letterDocxPath = entry;
        if (role === "letter_pdf" && !letterPdfPath) letterPdfPath = entry;
      }

      const uploadResults = await mapWithConcurrency(candidates, UPLOAD_CONCURRENCY, async (f) => {
        const name = baseName(f.relPath);
        const role = classifyRelPath(f.relPath);
        const mime = mimeFor(name);
        const subPath = forensicR2SubPath(f.relPath, code);
        const key = `${R2_FOLDER_PREFIX}/${code}/${subPath}`;
        try {
          const bytes = await readFile(f.absPath);
          await uploadToR2({ key, body: bytes, contentType: mime, contentLength: f.size });

          const fp = mime.startsWith("image/") ? await fingerprintImage(bytes, mime).catch(() => null) : null;
          const row = {
            job_case_id: jobCaseId,
            job_number: code,
            document_type: docTypeForRole(role, name),
            original_file_name: name,
            title: name,
            storage_bucket: R2_STORAGE_SENTINEL,
            storage_path: key,
            relative_path: subPath,
            mime_type: mime,
            file_size: f.size,
            source: "forensic_zip",
            is_blank_template: isBlankTemplate(name),
            ocr_status: role === "portal_pdf" ? "Queued" : "Skipped",
            ocr_language: "eng+kan",
            ai_extracted_json: role === "min_json" || role === "rich_json" ? (job.dataset ?? null) : null,
            file_sha256: fp?.sha256 ?? null,
            phash: fp?.phash ?? null,
            dhash: fp?.dhash ?? null,
            exif_gps_lat: fp?.gpsLat ?? null,
            exif_gps_lon: fp?.gpsLon ?? null,
            exif_taken_at: fp?.takenAt ?? null,
            created_by: user.id,
          };
          // Migrate a legacy (non-R2) row in place instead of inserting a
          // duplicate — the old Supabase object is left orphaned (harmless).
          const legacyId = legacyRowIdByName.get(name);
          if (legacyId) {
            const { error: updErr } = await admin.from("job_documents").update(row).eq("id", legacyId);
            if (updErr) throw new Error(updErr.message);
          } else {
            const { error: insErr } = await admin.from("job_documents").insert(row);
            if (insErr) throw new Error(insErr.message);
          }

          console.log(`[commitForensicImportAction] file uploaded job=${code} file=${name} key=${key} migrated=${legacyId ? "yes" : "no"} user=${user.id} ts=${new Date().toISOString()}`);
          return { ok: true as const, name };
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Upload failed";
          console.error(`[commitForensicImportAction] file upload FAILED job=${code} file=${name} user=${user.id} ts=${new Date().toISOString()}`, e);
          return { ok: false as const, name, error: msg };
        }
      });

      const failedFiles = uploadResults.filter((r): r is { ok: false; name: string; error: string } => !r.ok);
      totalUploaded += uploadResults.length - failedFiles.length;
      totalFailed += failedFiles.length;

      const { count } = await admin
        .from("job_documents")
        .select("id", { count: "exact", head: true })
        .eq("job_case_id", jobCaseId);
      await admin.from("job_cases").update({ file_count: count ?? 0 }).eq("id", jobCaseId);

      // 3) Map the skill JSON → job_audits + side tables (no engine re-run).
      let auditRow: ReturnType<typeof auditRowFromReport> | null = null;
      if (job.dataset) {
        const report = datasetToAuditReport(code, job.dataset);
        auditRow = auditRowFromReport(report);
        await admin.from("job_audits").insert({ job_number: code, ...auditRow, created_by: user.id });

        // Refresh our (document_id-null) derived rows; leave portal-derived rows intact.
        await admin.from("job_running_bills").delete().eq("job_number", code).is("document_id", null);
        const rbRows = datasetToRunningBillRows(code, job.dataset);
        if (rbRows.length) await admin.from("job_running_bills").insert(rbRows);

        await admin.from("job_timeline_dates").delete().eq("job_number", code).is("document_id", null);
        const tlRows = datasetToTimelineRows(code, job.dataset).map((r) => ({ ...r, created_by: user.id }));
        if (tlRows.length) await admin.from("job_timeline_dates").insert(tlRows);
      }

      // 4) Convert to a Complaint (reused verbatim, idempotent).
      const conv = await convertJobCaseToComplaint(jobCaseId);
      if (!conv.ok || !conv.complaintId) throw new Error(conv.error || "Could not create the complaint.");
      const complaintId = conv.complaintId;

      // 4b) Make the complaint trackable by Ward / Division / Sub-division, and
      // default an Assigned Engineer + Responsible Department from the org
      // directory — never clobbering a value a human already set (e.g. a manual
      // reassignment surviving a re-import/refresh of the same job).
      try {
        const org = await resolveOrgIds(admin, job.dataset, code);
        const patch: Record<string, unknown> = {};
        if (org.division_id) patch.division_id = org.division_id;
        if (org.eng_subdivision_id) patch.eng_subdivision_id = org.eng_subdivision_id;
        if (org.ward_id) patch.ward_id = org.ward_id;

        const { data: current } = await admin
          .from("complaints")
          .select("assigned_engineer_id, responsible_department")
          .eq("id", complaintId)
          .single();
        if (!current?.assigned_engineer_id || !current?.responsible_department) {
          const officer = await resolveAssignedEngineer(admin, org.eng_subdivision_id);
          if (!current?.assigned_engineer_id && officer.assigned_engineer_id) {
            patch.assigned_engineer_id = officer.assigned_engineer_id;
          }
          if (!current?.responsible_department && officer.responsible_department) {
            patch.responsible_department = officer.responsible_department;
          }
        }
        // Fallback so Responsible department is never blank: the executive-
        // engineering sub-division that owns the work, derived from the skill's
        // sub_division text (this is who grounds[].officer names for oversight).
        if (!current?.responsible_department && !patch.responsible_department) {
          const sub = job.dataset?.sub_division?.trim();
          if (sub) patch.responsible_department = `Executive Engineer, ${sub} Sub-division (BBMP)`;
        }

        if (Object.keys(patch).length) await admin.from("complaints").update(patch).eq("id", complaintId);
      } catch (e) {
        console.warn("[commitForensicImportAction] org-id mapping", code, e);
      }

      // 5) Attach the skill's letter as the printable complaint letter.
      if (job.letterText || letterDocxPath || letterPdfPath) {
        // Skip letter-draft/doc/timeline inserts that already exist for this
        // complaint, so re-committing the same complaint doesn't pile up dupes.
        const { data: existingLd } = await admin
          .from("letter_drafts").select("id").eq("complaint_id", complaintId).eq("variant", "bill_stop").limit(1);
        if (!existingLd?.length) {
          await admin.from("letter_drafts").insert({
            job_number: code,
            complaint_id: complaintId,
            variant: "bill_stop",
            language: "Kannada",
            signatory_key: "raghav_gowda",
            content: job.letterText || null,
            risk_score: auditRow?.risk_score ?? null,
            band: auditRow?.risk_band ?? null,
            ai_used: job.source === "ai-from-letter",
            lint_ok: false,
            file_name: letterDocxPath?.name ?? letterPdfPath?.name ?? null,
            created_by: user.id,
          });
        }
        const { data: existingCd } = await admin
          .from("complaint_documents").select("original_file_name").eq("complaint_id", complaintId);
        const haveCd = new Set((existingCd ?? []).map((r) => r.original_file_name as string));
        for (const lf of [letterDocxPath, letterPdfPath]) {
          if (!lf || haveCd.has(lf.name)) continue;
          await admin.from("complaint_documents").insert({
            complaint_id: complaintId,
            document_type: lf === letterDocxPath ? "Generated complaint letter" : "Generated complaint letter (PDF)",
            title: lf.name,
            original_file_name: lf.name,
            storage_bucket: R2_STORAGE_SENTINEL,
            storage_path: lf.key,
            relative_path: lf.subPath,
            mime_type: lf.mime,
            file_size: lf.size,
            ocr_status: "Skipped",
            uploaded_by: user.id,
          });
        }
        await admin.from("complaint_timeline").insert({
          complaint_id: complaintId,
          event_type: "Note",
          title: "Forensic letter imported from skill output",
          summary: `Drafted Kannada complaint letter attached for job ${code}.`,
          created_by: user.id,
        });
      }

      createdCaseIds.push(jobCaseId);
      createdComplaintIds.push(complaintId);
      perJob.push({
        jobCode: code,
        jobCaseId,
        complaintId,
        filesTotal: candidates.length,
        filesUploaded: uploadResults.length - failedFiles.length,
        filesFailed: failedFiles.map((f) => ({ fileName: f.name, error: f.error })),
      });
      console.log(`[commitForensicImportAction] job completed job=${code} caseId=${jobCaseId} complaintId=${complaintId} filesUploaded=${uploadResults.length - failedFiles.length} filesFailed=${failedFiles.length} user=${user.id} ts=${new Date().toISOString()}`);
    } catch (e) {
      console.error(`[commitForensicImportAction] job FAILED job=${code} user=${user.id} ts=${new Date().toISOString()}`, e);
      perJob.push({ jobCode: code, error: e instanceof Error ? e.message : "Failed" });
    }
  }

  const durationMs = Date.now() - startedAt;
  const summary = { totalFiles, uploaded: totalUploaded, failed: totalFailed, skipped: totalSkipped, durationMs };

  await admin
    .from("forensic_import_batches")
    .update({ status: "Committed", created_case_ids: createdCaseIds, created_complaint_ids: createdComplaintIds, commit_summary: summary })
    .eq("id", params.batchId);

  // Delete the temp dir ONLY NOW — after ALL selected jobs have been
  // processed (success or failure), never per-job (multiple jobs share one
  // batch dir). A partially-failed commit is NOT retryable from this temp
  // dir afterward — the only recovery is a fresh re-upload; accepted per plan.
  await deleteTempDir(tempDirPath);
  console.log(`[commitForensicImportAction] completed batch=${params.batchId} user=${user.id} summary=${JSON.stringify(summary)} ts=${new Date().toISOString()}`);

  // Drop an alert into the notifications inbox (this is an automated job too).
  const okJobs = perJob.filter((p) => !p.error).length;
  const failJobs = perJob.filter((p) => p.error).length;
  await notifyUser(admin, user.id, {
    type: failJobs ? "job_failed" : "job_done",
    title: `Forensic import: ${okJobs} complaint${okJobs === 1 ? "" : "s"} created${failJobs ? `, ${failJobs} failed` : ""}`,
    body: `${summary.uploaded} file(s) uploaded to storage${summary.failed ? `, ${summary.failed} failed` : ""}.`,
    link: "/complaints",
    entityType: "complaint",
  });

  revalidatePath("/complaints");
  revalidatePath("/complaints/import");
  revalidatePath("/complaints/duplicate-photos");

  // Auto-run cross-job duplicate-photo detection for each affected division
  // (the photo-reuse pattern is within a division). Runs after the response so
  // the commit returns immediately; bounded + cached inside the scan.
  const divisions = [...new Set(selected.map((j) => j.dataset?.division?.trim()).filter(Boolean) as string[])];
  if (divisions.length) {
    after(async () => {
      for (const d of divisions) {
        try {
          await scanDivisionVisualDuplicates(d);
        } catch (e) {
          console.warn("[commitForensicImportAction] auto duplicate-photo scan", d, e);
        }
      }
    });
  }

  return { success: true, perJob, createdComplaintIds, summary };
}
