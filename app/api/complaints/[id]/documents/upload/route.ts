import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadBuffer, validateUpload, buildPath } from "@/lib/storage/supabase-upload";
import { processDocumentOcr } from "@/lib/ocr/process-document";
import { fingerprintImage } from "@/lib/ocr/image-fingerprint";
import { findPhotoMatches, deriveStage } from "@/lib/dedupe-photos";
import { getComplaintSettings } from "@/lib/settings";
import { isAiConfigured } from "@/lib/ai/provider";
import { COMPLAINT_FIELD_ROLES, STORAGE_BUCKETS } from "@/lib/constants";

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
  const bucket = asEvidence || isSitePhoto ? STORAGE_BUCKETS.evidence : STORAGE_BUCKETS.documents;
  const path = buildPath(id, file.name || "upload", Date.now(), Math.random().toString(36).slice(2, 8));

  // 1) Upload original to PRIVATE storage.
  try {
    await uploadBuffer({ bucket, path, body: buffer, contentType: mime });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Storage upload failed." }, { status: 500 });
  }

  const wantsOcr = String(form.get("runOcr")) === "true" && mime !== "application/pdf";
  const initialOcr = mime === "application/pdf" ? "Skipped" : wantsOcr ? "Queued" : "Not Started";

  // Fingerprint for duplicate-photo detection (best-effort; never blocks upload).
  const fp = await fingerprintImage(buffer, mime).catch(() => null);

  // 2) Persist document row (admin client; app-level role already checked).
  const admin = createAdminClient();
  const { data: doc, error } = await admin
    .from("complaint_documents")
    .insert({
      complaint_id: id,
      document_type: documentType,
      title: (form.get("title") as string) || file.name || null,
      description: (form.get("description") as string) || null,
      original_file_name: file.name || null,
      storage_bucket: bucket,
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
      const { data: comp } = await admin.from("complaints").select("division_id").eq("id", id).maybeSingle();
      const matches = await findPhotoMatches(fp, { excludeComplaintId: id, divisionId: comp?.division_id ?? null });
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

  // 4) OCR inline (best-effort). Failure NEVER breaks the upload.
  let ocrStatus = initialOcr;
  if (wantsOcr && settings.ocrAutoRun) {
    try {
      const r = await processDocumentOcr(documentId, { buffer, analyze: settings.aiAutoSummary });
      ocrStatus = r.status;
    } catch (e) {
      console.error("[upload] OCR failed (upload preserved)", e);
      ocrStatus = "Failed";
    }
  }

  return NextResponse.json({
    ok: true,
    documentId,
    bucket,
    ocrStatus,
    aiConfigured: isAiConfigured(),
    duplicateWarning,
  });
}
