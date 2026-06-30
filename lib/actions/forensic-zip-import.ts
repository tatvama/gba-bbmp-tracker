"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireRole, AuthorizationError } from "@/lib/auth";
import { scanDivisionVisualDuplicates } from "@/lib/forensic/job-photo-dedupe";
import { createAdminClient } from "@/lib/supabase/admin";
import { downloadFromR2 } from "@/lib/storage/r2-upload";
import { uploadBuffer, buildPath } from "@/lib/storage/supabase-upload";
import { COMPLAINT_FIELD_ROLES, COMPLAINT_WRITE_ROLES, STORAGE_BUCKETS } from "@/lib/constants";
import { readZipEntries } from "@/lib/forensic/zip";
import { classifyRelPath } from "@/lib/forensic/parse-skill-output";
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
import type {
  CommitForensicResult,
  ForensicFileRole,
  ForensicImportBatch,
  ForensicJobResult,
} from "@/lib/forensic/skill-output";

const MAX_FILES_PER_JOB = 300;

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
 * skill's text division/sub_division + the job code's ward number, so imported
 * complaints are trackable by Ward / Division / Sub-division. Best-effort: any
 * field that doesn't match a master row is left null (the text stays on job_cases).
 */
async function resolveOrgIds(
  admin: ReturnType<typeof createAdminClient>,
  dataset: { division?: string | null; sub_division?: string | null } | null | undefined,
  jobCode: string,
): Promise<{ division_id: string | null; eng_subdivision_id: string | null; ward_id: string | null }> {
  let division_id: string | null = null;
  let eng_subdivision_id: string | null = null;
  let ward_id: string | null = null;

  const divName = dataset?.division?.trim();
  if (divName) {
    const { data } = await admin.from("divisions").select("id").ilike("name", divName).limit(1);
    division_id = (data?.[0]?.id as string) ?? null;
  }
  const subName = dataset?.sub_division?.trim();
  if (subName) {
    let q = admin.from("eng_subdivisions").select("id").ilike("name", subName);
    if (division_id) q = q.eq("division_id", division_id);
    const { data } = await q.limit(1);
    eng_subdivision_id = (data?.[0]?.id as string) ?? null;
  }
  const wardNo = parseInt(jobCode.split("-")[0] ?? "", 10);
  if (Number.isFinite(wardNo)) {
    const { data } = await admin.from("wards").select("id").eq("new_no", wardNo).limit(1);
    ward_id = (data?.[0]?.id as string) ?? null;
  }
  return { division_id, eng_subdivision_id, ward_id };
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
    .select("id, status, storage_path, folder_count, jobs, created_case_ids, created_complaint_ids, error")
    .eq("id", batchId)
    .single();
  if (error || !data) return { error: "Import not found — it may have expired. Please re-upload." };

  return {
    success: true,
    batchId: data.id as string,
    status: data.status as ForensicImportBatch["status"],
    storagePath: data.storage_path as string,
    folderCount: (data.folder_count as number) ?? 0,
    jobs: (data.jobs as ForensicJobResult[]) ?? [],
    createdCaseIds: (data.created_case_ids as string[]) ?? [],
    createdComplaintIds: (data.created_complaint_ids as string[]) ?? [],
    error: (data.error as string) ?? undefined,
  };
}

/**
 * Commit a reviewed forensic import. Re-downloads + re-unzips the staged ZIP (does
 * not trust client bytes); for each selected, valid-code job: upserts a job_case,
 * uploads its files to the job-documents bucket (fingerprinting images), maps the
 * skill JSON into job_audits + side tables (NO engine re-run), converts the job
 * case to a Complaint, and attaches the skill's letter as the printable letter.
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
    .select("id, storage_path")
    .eq("id", params.batchId)
    .single();
  if (!batch?.storage_path) return { error: "Import batch not found — please re-upload." };

  const zip = await downloadFromR2(batch.storage_path as string);
  if (!zip) return { error: "Could not re-read the staged ZIP — please re-upload." };

  // Re-unzip and index every entry by the job code in its path (batch-agnostic;
  // a job's source docs + its shared _AUDIT_OUTPUT files all carry its code).
  const byCode = new Map<string, { relPath: string; bytes: Uint8Array }[]>();
  for (const e of readZipEntries(zip)) {
    const code = extractJobCode(e.path);
    if (!code) continue;
    (byCode.get(code) ?? byCode.set(code, []).get(code)!).push({ relPath: e.path, bytes: e.bytes });
  }

  const selected = params.jobs.filter((j) => !j.skip && j.validCode);
  if (!selected.length) return { error: "No job folders selected to import." };

  const perJob: NonNullable<CommitForensicResult["perJob"]> = [];
  const createdCaseIds: string[] = [];
  const createdComplaintIds: string[] = [];

  for (const job of selected) {
    const code = job.jobCode;
    const entries = byCode.get(code);
    if (!entries) {
      perJob.push({ jobCode: code, error: "No files found in the ZIP for this job code." });
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

      // 2) Upload files → job-documents (skip ones already present; fingerprint images).
      const { data: existingDocs } = await admin
        .from("job_documents")
        .select("original_file_name")
        .eq("job_number", code);
      const have = new Set((existingDocs ?? []).map((r) => r.original_file_name as string));

      let letterDocxPath: { name: string; path: string; mime: string; size: number } | null = null;
      let letterPdfPath: { name: string; path: string; mime: string; size: number } | null = null;

      for (const e of entries.slice(0, MAX_FILES_PER_JOB)) {
        const name = baseName(e.relPath);
        const role = classifyRelPath(e.relPath);
        if (role === "other") continue; // skip WO-*-NA.jpg placeholders, ocr cache, batch logs, index json
        if (have.has(name)) continue;
        const mime = mimeFor(name);
        const body = Buffer.from(e.bytes);
        const path = buildPath(jobCaseId, name, Date.now(), Math.random().toString(36).slice(2, 8));
        await uploadBuffer({ bucket: STORAGE_BUCKETS.jobDocuments, path, body, contentType: mime });

        const fp = mime.startsWith("image/") ? await fingerprintImage(body, mime).catch(() => null) : null;
        await admin.from("job_documents").insert({
          job_case_id: jobCaseId,
          job_number: code,
          document_type: docTypeForRole(role, name),
          original_file_name: name,
          title: name,
          storage_bucket: STORAGE_BUCKETS.jobDocuments,
          storage_path: path,
          mime_type: mime,
          file_size: body.byteLength,
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
        });
        if (role === "letter_docx" && !letterDocxPath) letterDocxPath = { name, path, mime, size: body.byteLength };
        if (role === "letter_pdf" && !letterPdfPath) letterPdfPath = { name, path, mime, size: body.byteLength };
      }

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

      // 4b) Make the complaint trackable by Ward / Division / Sub-division.
      try {
        const org = await resolveOrgIds(admin, job.dataset, code);
        const patch: Record<string, unknown> = {};
        if (org.division_id) patch.division_id = org.division_id;
        if (org.eng_subdivision_id) patch.eng_subdivision_id = org.eng_subdivision_id;
        if (org.ward_id) patch.ward_id = org.ward_id;
        if (Object.keys(patch).length) await admin.from("complaints").update(patch).eq("id", complaintId);
      } catch (e) {
        console.warn("[commitForensicImportAction] org-id mapping", code, e);
      }

      // 5) Attach the skill's letter as the printable complaint letter.
      if (job.letterText || letterDocxPath || letterPdfPath) {
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
        for (const lf of [letterDocxPath, letterPdfPath]) {
          if (!lf) continue;
          await admin.from("complaint_documents").insert({
            complaint_id: complaintId,
            document_type: lf === letterDocxPath ? "Generated complaint letter" : "Generated complaint letter (PDF)",
            title: lf.name,
            original_file_name: lf.name,
            storage_bucket: STORAGE_BUCKETS.jobDocuments,
            storage_path: lf.path,
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
      perJob.push({ jobCode: code, jobCaseId, complaintId });
    } catch (e) {
      console.error("[commitForensicImportAction]", code, e);
      perJob.push({ jobCode: code, error: e instanceof Error ? e.message : "Failed" });
    }
  }

  await admin
    .from("forensic_import_batches")
    .update({ status: "Committed", created_case_ids: createdCaseIds, created_complaint_ids: createdComplaintIds })
    .eq("id", params.batchId);

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

  return { success: true, perJob, createdComplaintIds };
}
