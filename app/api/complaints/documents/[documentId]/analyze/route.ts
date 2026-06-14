import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { analyzeDocumentById } from "@/lib/ocr/process-document";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_FIELD_ROLES)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  try {
    const r = await analyzeDocumentById(documentId);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Analysis failed" }, { status: 500 });
  }
}
