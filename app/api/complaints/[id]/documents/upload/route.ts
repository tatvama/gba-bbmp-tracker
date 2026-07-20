import { NextResponse, type NextRequest, after } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadBuffer, validateUpload, buildPath } from "@/lib/storage/supabase-upload";
import { buildComplaintDocumentFileName, extFromUpload } from "@/lib/complaints/document-naming";
import { analyzeDocumentById } from "@/lib/ocr/process-document";
import { fingerprintImage } from "@/lib/ocr/image-fingerprint";
import { findPhotoMatches, deriveStage } from "@/lib/dedupe-photos";
import { scanDivisionVisualDuplicates } from "@/lib/forensic/job-photo-dedupe";
import { geofencePhoto } from "@/lib/geo";
import { getComplaintSettings, getForensicsRules } from "@/lib/settings";
import { isAiConfigured } from "@/lib/ai/provider";
import { uploadToR2 } from "@/lib/storage/r2-upload";
import { COMPLAINT_FIELD_ROLES, STORAGE_BUCKETS, R2_STORAGE_SENTINEL } from "@/lib/constants";
import { startJob } from "@/lib/jobs/runner";
// Side-effect import: registers the "ocr" job handler.
import "@/lib/jobs/handlers";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_FIELD_ROLES) || !user) {
    return NextResponse.json({ error: "Not authorized to upload documents." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  const settings = await getComplaintSettings();
  const maxBytes = (settings.maxUploadMb || 15) * 1024 * 1024;
  const mime = file.type || "";
  const valid = validateUpload(mime, file.size, maxBytes);
  if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const documentType = (form.get("documentType") as string) || null;
  const asEvidence = String(form.get("asEvidence")) === "true";
  const isSitePhoto = !!documentType && documentType.startsWith("Site photo");

  // Admin client created early — the file name itself now depends on a DB read
  // (the complaint's job/case number + a same-type document count), so it must
  // resolve before the storage path is built, not after.
  const admin = createAdminClient();
  const fileName = await buildComplaintDocumentFileName(admin, id, documentType || "", extFromUpload(mime, file.name || ""));
  const path = buildPath(id, fileName, Date.now(), Math.random().toString(36).slice(2, 8));

  // 1) Upload original to PRIVATE storage (R2).
  try {
    await uploadToR2({ key: path, body: buffer, contentType: mime });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Storage upload failed." }, { status: 500 });
  }

  const wantsOcr = String(form.get("runOcr")) === "true" && mime !== "application/pdf";
  const initialOcr = mime === "application/pdf" ? "Skipped" : wantsOcr ? "Queued" : "Not Started";

  // Fingerprint for duplicate-photo detection (best-effort; never blocks upload).
  const fp = await fingerprintImage(buffer, mime).catch(() => null);

  // 2) Persist document row (app-level role already checked above).

  // Geofence: is the photo's EXIF GPS near the complaint's reported location?
  const { data: comp } = await admin
    .from("complaints")
    .select("division_id, latitude, longitude")
    .eq("id", id)
    .maybeSingle();
  const divisionId = (comp as { division_id?: string | null } | null)?.division_id ?? null;
  let geo: { flag: string; distanceM: number | null } = { flag: "no_gps", distanceM: null };
  try {
    const rules = await getForensicsRules();
    geo = geofencePhoto(
      fp?.gpsLat ?? null,
      fp?.gpsLon ?? null,
      (comp as { latitude?: number | null } | null)?.latitude ?? null,
      (comp as { longitude?: number | null } | null)?.longitude ?? null,
      rules.geofenceMaxMeters,
    );
  } catch { /* best-effort */ }

  const { data: doc, error } = await admin
    .from("complaint_documents")
    .insert({
      complaint_id: id,
      document_type: documentType,
      title: (form.get("title") as string) || file.name || null,
      description: (form.get("description") as string) || null,
      original_file_name: fileName,
      storage_bucket: R2_STORAGE_SENTINEL,
      storage_path: path,
      mime_type: mime,
      file_size: file.size,
      uploaded_by: user.id,
      captured_date: (form.get("capturedDate") as string) || null,
      document_date: (form.get("documentDate") as string) || null,
      source_person: (form.get("sourcePerson") as string) || null,
      source_department: (form.get("sourceDepartment") as string) || null,
      source_office: (form.get("sourceOffice") as string) || null,
      internal_notes: (form.get("internalNotes") as string) || null,
      ocr_status: initialOcr,
      ocr_language: settings.ocrLanguage,
      file_sha256: fp?.sha256 ?? null,
      phash: fp?.phash ?? null,
      dhash: fp?.dhash ?? null,
      exif_gps_lat: fp?.gpsLat ?? null,
      exif_gps_lon: fp?.gpsLon ?? null,
      exif_taken_at: fp?.takenAt ?? null,
      photo_stage: deriveStage(documentType),
      geo_flag: geo.flag,
      geo_distance_m: geo.distanceM,
    })
    .select("id")
    .single();
  if (error || !doc) {
    return NextResponse.json({ error: error?.message ?? "Could not save document." }, { status: 500 });
  }
  const documentId = doc.id as string;

  // 3) Timeline + audit (best-effort).
  await admin.from("complaint_timeline").insert({
    complaint_id: id,
    event_type: isSitePhoto ? "Photo Evidence" : "Note",
    title: `Document uploaded: ${documentType ?? file.name ?? "file"}`,
    related_document_id: documentId,
    created_by: user.id,
  });
  await admin.from("audit_logs").insert({
    entity_type: "complaint",
    entity_id: id,
    field_name: "document_uploaded",
    old_value: null,
    new_value: documentType ?? file.name ?? "file",
    changed_by: user.id,
  });

  // 3b) Duplicate-photo check across other jobs/cases (best-effort).
  let duplicateWarning: {
    severity: string;
    count: number;
    sameDivision: boolean;
    matches: { jobNumber: string | null; caseNumber: string | null; road: string | null; division: string | null; severity: string; sameDivision: boolean }[];
  } | null = null;
  if (fp) {
    try {
      const matches = await findPhotoMatches(fp, { excludeComplaintId: id, divisionId });
      if (matches.length) {
        const severity = matches[0]!.severity;
        await admin
          .from("complaint_documents")
          .update({
            is_duplicate: true,
            verification_status: "Duplicate",
            dup_severity: severity,
            dup_matches: matches.slice(0, 20),
            dup_checked_at: new Date().toISOString(),
          })
          .eq("id", documentId);
        duplicateWarning = {
          severity,
          count: matches.length,
          sameDivision: matches.some((m) => m.sameDivision),
          matches: matches.slice(0, 5).map((m) => ({
            jobNumber: m.jobNumber,
            caseNumber: m.caseNumber,
            road: m.road,
            division: m.division,
            severity: m.severity,
            sameDivision: m.sameDivision,
          })),
        };
        await admin.from("complaint_timeline").insert({
          complaint_id: id,
          event_type: "Note",
          title: `⚠ Possible duplicate photo (${severity}) — same image on ${matches.length} other case(s)`,
          summary: matches
            .slice(0, 5)
            .map((m) => `${m.jobNumber ?? m.caseNumber ?? "?"}${m.road ? ` (${m.road})` : ""}${m.sameDivision ? " · same division" : ""}`)
            .join("; "),
          related_document_id: documentId,
          created_by: user.id,
        });
      }
    } catch (e) {
      console.error("[upload] duplicate check failed (upload preserved)", e);
    }
  }

  // 4) OCR as a background job — never blocks the upload response (previously
  // awaited processDocumentOcr() inline). willAnalyzeAfterOcr decides whether
  // THIS job also generates the AI summary once OCR finishes (processDocumentOcr's
  // own analyze option) — section 5 below skips firing a second, separate
  // analyzeDocumentById call in that case, since racing ahead of an in-flight
  // OCR job would re-run OCR itself via its ensureOcr fallback.
  let ocrStatus = initialOcr;
  const willAnalyzeAfterOcr = isAiConfigured() && !isSitePhoto && !asEvidence;
  const ocrJobStarting = wantsOcr && settings.ocrAutoRun;
  let ocrJobId: string | undefined;
  if (ocrJobStarting) {
    ocrStatus = "Processing";
    const started = await startJob(admin, {
      type: "ocr",
      title: "OCR",
      entityType: "complaint_document",
      entityId: documentId,
      input: { documentId, analyze: willAnalyzeAfterOcr },
      userId: user.id,
    });
    ocrJobId = started.jobId;
  }

  // 4b) VISUAL duplicate scan (print→scan reuse the hashes above can't catch).
  // Runs AFTER the response is sent — the vision compare is slow AI work. Only
  // for images on complaints linked to a job case (cross-JOB detection needs a
  // job code + division); the pair cache keeps repeat scans cheap.
  if (mime.startsWith("image/") && isAiConfigured()) {
    after(async () => {
      try {
        const { data: jc } = await admin
          .from("job_cases")
          .select("division")
          .eq("complaint_id", id)
          .maybeSingle();
        const division = (jc?.division as string | null) ?? null;
        if (!division) return;
        const res = await scanDivisionVisualDuplicates(division);
        const mine = res.matches.filter((m) => m.a.documentId === documentId || m.b.documentId === documentId);
        if (mine.length) {
          await admin.from("complaint_timeline").insert({
            complaint_id: id,
            event_type: "Note",
            title: `⚠ Visual duplicate suspicion — this photo appears under ${mine.length} other job code(s)`,
            summary: mine
              .slice(0, 5)
              .map((m) => {
                const other = m.a.documentId === documentId ? m.b : m.a;
                return `${other.jobNumber} (${m.confidence})`;
              })
              .join("; "),
            related_document_id: documentId,
            created_by: user.id,
          });
        }
      } catch (e) {
        console.warn("[upload] visual duplicate scan failed (upload preserved)", e);
      }
    });
  }

  // 5) AI summary — generate ONCE now, store permanently. Skipped for pure
  // site/evidence photos (no text to summarise — their AI is image verification),
  // and when no AI key is configured. Photos can still be summarised on demand.
  // When an OCR job just started above, THAT job generates the summary itself
  // once OCR finishes — firing analyzeDocumentById separately here would race
  // ahead of it and re-run OCR via ensureOcr.
  let summaryStatus: "none" | "generating" = "none";
  if (willAnalyzeAfterOcr) {
    summaryStatus = "generating";
    if (!ocrJobStarting) {
      await admin.from("complaint_documents").update({ ai_summary_status: "generating" }).eq("id", documentId);
      void analyzeDocumentById(documentId, { ensureOcr: true }).catch((e) => console.error("[upload] summary generation failed", e));
    }
  }

  return NextResponse.json({
    ok: true,
    documentId,
    bucket: R2_STORAGE_SENTINEL,
    ocrStatus,
    ocrJobId,
    summaryStatus,
    aiConfigured: isAiConfigured(),
    duplicateWarning,
  });
}
