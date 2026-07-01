import { NextResponse, type NextRequest, after } from "next/server";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { processForensicBatch } from "@/lib/forensic/import-runner";
import { MAX_ZIP_BYTES, extractZipToTempDir, deleteTempDir } from "@/lib/forensic/zip";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Forensic ZIP upload. A ZIP can exceed the 6 MB Server-Action body cap
 * (next.config.mjs), so the upload goes through this Route Handler. The raw
 * ZIP is NEVER uploaded anywhere — it's extracted into a local temp directory
 * on this container's disk (transient; survives across the analyze→commit
 * requests only as long as this same container instance is alive), a
 * Processing batch row is recorded pointing at that directory, and background
 * inventory/parse runs via `after()` (survives a client refresh; polls by
 * batch id).
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
  console.log(`[forensicImport:upload] validated user=${user.id} file=${file.name} size=${file.size} ts=${new Date().toISOString()}`);

  const importId = randomUUID();
  const tempDir = path.join(os.tmpdir(), "gba-forensic-import", importId);

  let batchId: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await mkdir(tempDir, { recursive: true });

    const t0 = Date.now();
    console.log(`[forensicImport:upload] extraction started user=${user.id} tempDir=${tempDir} ts=${new Date().toISOString()}`);
    const manifest = await extractZipToTempDir(buffer, tempDir);
    console.log(`[forensicImport:upload] extraction completed user=${user.id} tempDir=${tempDir} files=${manifest.length} ms=${Date.now() - t0} ts=${new Date().toISOString()}`);
    if (manifest.length === 0) {
      await deleteTempDir(tempDir);
      return NextResponse.json({ error: "ZIP contained no readable files." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("forensic_import_batches")
      .insert({
        status: "Processing",
        extract_dir: tempDir,
        original_file_name: file.name,
        zip_size: file.size,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message || "Could not create the import batch.");
    batchId = data.id as string;
  } catch (e) {
    await deleteTempDir(tempDir); // no batch row exists yet to track cleanup — do it here
    console.error(`[forensicImport:upload] failed user=${user.id} ts=${new Date().toISOString()}`, e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed." }, { status: 500 });
  }

  const captured = { batchId, tempDir };
  after(async () => {
    await processForensicBatch(captured.batchId, captured.tempDir);
  });

  return NextResponse.json({ batchId });
}
