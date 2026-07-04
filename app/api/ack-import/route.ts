import { NextResponse, type NextRequest, after } from "next/server";
import { randomUUID } from "node:crypto";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildMergedPdf } from "@/lib/pdf/merge";
import { uploadToR2 } from "@/lib/storage/r2-upload";
import { processAckBatch } from "@/lib/complaints/ack-runner";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Bulk acknowledgment PDFs can be large (hundreds of scanned pages). This is the
 *  single-POST ceiling; beyond it, split the file into a few uploads. */
const MAX_BYTES = 300 * 1024 * 1024;

/**
 * Upload a scanned PDF (or images) of MANY BBMP acknowledgments. Merged into one
 * canonical PDF, stored in R2, and processed in the BACKGROUND (render → OCR →
 * detect sections → match to existing complaints). Returns a batchId immediately;
 * the client polls /api/ack-import/[batchId] and then reviews at
 * /complaints/acknowledgments/[batchId].
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !hasRole(user, COMPLAINT_FIELD_ROLES)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  let raw = form.getAll("files");
  if (raw.length === 0) raw = form.getAll("file");
  const files = raw.filter(
    (x): x is File => typeof x === "object" && x !== null && typeof (x as { arrayBuffer?: unknown }).arrayBuffer === "function",
  );
  if (files.length === 0) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });

  const totalSize = files.reduce((n, f) => n + f.size, 0);
  if (totalSize <= 0) return NextResponse.json({ error: "Empty file." }, { status: 400 });
  if (totalSize > MAX_BYTES) {
    return NextResponse.json(
      { error: `Upload too large (${(totalSize / 1_048_576).toFixed(0)} MB). Max ${Math.round(MAX_BYTES / 1_048_576)} MB — split the PDF into a few smaller files.` },
      { status: 400 },
    );
  }

  const parts: { buffer: Buffer; mimeType: string }[] = [];
  for (const f of files) {
    const isImage = f.type.startsWith("image/");
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (!isImage && !isPdf) return NextResponse.json({ error: `Unsupported file "${f.name}". Use a PDF or images.` }, { status: 400 });
    parts.push({ buffer: Buffer.from(await f.arrayBuffer()), mimeType: isPdf ? "application/pdf" : f.type });
  }
  const originalName = files.length === 1 ? files[0]!.name : `acknowledgments-${files.length}-files.pdf`;

  let batchId: string;
  try {
    const { pdf, pageCount } = await buildMergedPdf(parts);
    const originalUrl = await uploadToR2({ key: `ack-imports/${randomUUID()}.pdf`, body: pdf, contentType: "application/pdf" });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("ack_import_batches")
      .insert({
        status: "processing",
        stage: "Queued",
        message: "Waiting to start…",
        original_storage_path: originalUrl,
        original_name: originalName,
        page_count: pageCount,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message || "Could not create the batch.");
    batchId = data.id as string;
  } catch (e) {
    console.error("[ackImport:upload] failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed." }, { status: 500 });
  }

  const captured = batchId;
  after(async () => {
    await processAckBatch(captured);
  });

  return NextResponse.json({ batchId });
}
