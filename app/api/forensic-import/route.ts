import { NextResponse, type NextRequest, after } from "next/server";
import { randomUUID } from "node:crypto";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadToR2 } from "@/lib/storage/r2-upload";
import { processForensicBatch } from "@/lib/forensic/import-runner";
import { MAX_ZIP_BYTES } from "@/lib/forensic/zip";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Forensic ZIP upload. A ZIP can exceed the 6 MB Server-Action body cap
 * (next.config.mjs), so the upload goes through this Route Handler. It stages the
 * raw ZIP in R2, records a Processing batch, kicks off background inventory/parse
 * via `after()` (survives a client refresh), and returns the batch id to poll.
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

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No ZIP uploaded." }, { status: 400 });
  }
  const nameOk = file.name.toLowerCase().endsWith(".zip");
  const typeOk = ["application/zip", "application/x-zip-compressed", "application/octet-stream", ""].includes(file.type);
  if (!nameOk && !typeOk) {
    return NextResponse.json({ error: "Please upload a .zip file." }, { status: 400 });
  }
  if (file.size <= 0) {
    return NextResponse.json({ error: "Empty file." }, { status: 400 });
  }
  if (file.size > MAX_ZIP_BYTES) {
    return NextResponse.json(
      { error: `ZIP too large (${(file.size / 1_048_576).toFixed(0)} MB). Max ${Math.round(MAX_ZIP_BYTES / 1_048_576)} MB.` },
      { status: 400 },
    );
  }

  let storagePath: string;
  let batchId: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    storagePath = await uploadToR2({
      key: `forensic/_imports/${randomUUID()}.zip`,
      body: buffer,
      contentType: "application/zip",
    });
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("forensic_import_batches")
      .insert({
        status: "Processing",
        storage_path: storagePath,
        original_file_name: file.name,
        zip_size: file.size,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message || "Could not create the import batch.");
    batchId = data.id as string;
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed." }, { status: 500 });
  }

  const captured = { batchId, storagePath };
  after(async () => {
    await processForensicBatch(captured.batchId, captured.storagePath);
  });

  return NextResponse.json({ batchId, storagePath });
}
