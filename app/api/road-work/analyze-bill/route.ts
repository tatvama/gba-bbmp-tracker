import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { validateUpload } from "@/lib/storage/supabase-upload";
import { runOcr } from "@/lib/ocr/ocr-service";
import { analyzeRoadWorkBill } from "@/lib/ai/road-work-analyzer";
import { getComplaintSettings } from "@/lib/settings";
import { isAiConfigured } from "@/lib/ai/provider";
import { RTI_WRITE_ROLES, COMPLAINT_WRITE_ROLES } from "@/lib/constants";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * OCR a road-work financial document (bill / MB book / estimate) and run the
 * red-flag audit against the framework. In-memory only — nothing is persisted.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const allowed = hasRole(user, RTI_WRITE_ROLES) || hasRole(user, COMPLAINT_WRITE_ROLES);
  if (!allowed || !user) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
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
  const documentType = (form.get("documentType") as string) || null;

  const settings = await getComplaintSettings();
  const maxBytes = (settings.maxUploadMb || 15) * 1024 * 1024;
  const mime = file.type || "";
  const valid = validateUpload(mime, file.size, maxBytes);
  if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const ocr = await runOcr({ buffer, mimeType: mime, language: settings.ocrLanguage });
  const audit = await analyzeRoadWorkBill(ocr.cleanText || ocr.rawText || "", documentType);

  return NextResponse.json({
    ok: true,
    ocrStatus: ocr.status,
    ocrText: ocr.cleanText || ocr.rawText || "",
    ocrNote: ocr.note ?? null,
    audit: audit.audit,
    auditOk: audit.ok,
    aiConfigured: isAiConfigured(),
  });
}
