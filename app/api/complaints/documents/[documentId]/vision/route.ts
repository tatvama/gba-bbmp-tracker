import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { downloadBuffer } from "@/lib/storage/supabase-upload";
import { analyzePhotoVision } from "@/lib/ai/photo-vision";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Run Claude vision on an uploaded photo: genuine site photo? matches the work?
 *  screenshot/stock/edited? Stores the verdict on the document. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_FIELD_ROLES)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("complaint_documents")
    .select("id, complaint_id, storage_bucket, storage_path, mime_type, document_type")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });

  const { data: c } = await admin
    .from("complaints")
    .select("internal_case_number, title, type, location, landmark, description, job_number")
    .eq("id", doc.complaint_id)
    .maybeSingle();
  const context = c
    ? [
        `Case ${c.internal_case_number ?? "—"}: ${c.title}`,
        `Type: ${c.type}`,
        c.job_number ? `Job: ${c.job_number}` : "",
        c.location ? `Location: ${c.location}${c.landmark ? `, ${c.landmark}` : ""}` : "",
        doc.document_type ? `Document type claimed: ${doc.document_type}` : "",
        c.description ? `Description: ${c.description}` : "",
      ].filter(Boolean).join("\n")
    : "";

  const buffer = await downloadBuffer(doc.storage_bucket, doc.storage_path);
  if (!buffer) return NextResponse.json({ ok: false, error: "Could not download image" }, { status: 500 });

  const result = await analyzePhotoVision(buffer, doc.mime_type, context);
  await admin
    .from("complaint_documents")
    .update({
      vision_verdict: result.vision.verdict,
      vision_json: result.vision,
      vision_checked_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  return NextResponse.json({ ok: result.ok, vision: result.vision, error: result.error });
}
