import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { validateUpload } from "@/lib/storage/supabase-upload";
import { runOcr } from "@/lib/ocr/ocr-service";
import { extractWorkOrder } from "@/lib/ai/road-work-extractor";
import { getComplaintSettings } from "@/lib/settings";
import { isAiConfigured } from "@/lib/ai/provider";
import { RTI_WRITE_ROLES, COMPLAINT_FIELD_ROLES } from "@/lib/constants";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Standalone OCR + work-order extraction. Takes a file, runs OCR in memory, and
 * (if AI is configured) extracts the work-order facts. Does NOT persist anything —
 * the file is attached to the case later, after the case is created. Used by the
 * road-work letter generator (pre-case extraction).
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  // Either an RTI writer or a complaint field officer may use the generator.
  const allowed = hasRole(user, RTI_WRITE_ROLES) || hasRole(user, COMPLAINT_FIELD_ROLES);
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

  const settings = await getComplaintSettings();
  const maxBytes = (settings.maxUploadMb || 15) * 1024 * 1024;
  const mime = file.type || "";
  const valid = validateUpload(mime, file.size, maxBytes);
  if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  // OCR in memory (never throws; PDFs are skipped with a note).
  const ocr = await runOcr({ buffer, mimeType: mime, language: settings.ocrLanguage });

  // Structured extraction (best-effort; gated on AI key).
  const ex = await extractWorkOrder(ocr.cleanText || ocr.rawText || "");

  return NextResponse.json({
    ok: true,
    ocrStatus: ocr.status,
    ocrText: ocr.cleanText || ocr.rawText || "",
    ocrNote: ocr.note ?? null,
    extraction: ex.extraction,
    extractionOk: ex.ok,
    aiConfigured: isAiConfigured(),
  });
}
