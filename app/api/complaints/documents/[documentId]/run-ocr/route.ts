import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { processDocumentOcr } from "@/lib/ocr/process-document";
import { getComplaintSettings } from "@/lib/settings";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_FIELD_ROLES)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  const settings = await getComplaintSettings();
  try {
    const r = await processDocumentOcr(documentId, { analyze: settings.aiAutoSummary });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ ok: false, status: "Failed", error: e instanceof Error ? e.message : "OCR failed" }, { status: 500 });
  }
}
