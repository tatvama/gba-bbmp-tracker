import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/db";
import { getComplaintSettings } from "@/lib/settings";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";
import { startJob } from "@/lib/jobs/runner";
// Side-effect import: registers the "ocr" job handler.
import "@/lib/jobs/handlers";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Starts OCR as a background job and returns immediately — previously this
 * awaited processDocumentOcr() inline, so navigating away mid-request
 * abandoned the client's view of it (the maxDuration=60s window could also
 * simply time out on a big scanned PDF). processDocumentOcr's own logic is
 * unchanged; it now runs inside the generic runner (lib/jobs/runner.ts)
 * instead of directly in this handler.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const user = await getSessionUser();
  if (!user || !hasRole(user, COMPLAINT_FIELD_ROLES)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  const settings = await getComplaintSettings();
  const admin = createAdminClient();
  const r = await startJob(admin, {
    type: "ocr",
    title: "OCR",
    entityType: "complaint_document",
    entityId: documentId,
    input: { documentId, analyze: settings.aiAutoSummary },
    userId: user.id,
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 500 });
  return NextResponse.json({ ok: true, jobId: r.jobId });
}
