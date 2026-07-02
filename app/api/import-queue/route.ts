import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMPORT_CHUNK_SIZE, MAX_IMPORT_ZIP_BYTES } from "@/lib/import-queue/types";
import { listImportSessions, rowToSnapshot } from "@/lib/import-queue/store";
import { stagedPathFor, stagedSize } from "@/lib/import-queue/staging";
import { kickImportWorker } from "@/lib/import-queue/worker";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Chunked-import session API.
 *   GET  → the caller's active + recent upload sessions (used on page load to
 *          resume: 'uploading' rows continue from receivedBytes, queued/
 *          processing rows just show live progress). Also kicks the worker so
 *          a restarted server resumes its queue as soon as anyone looks.
 *   POST → create (or resume) a session for one ZIP file.
 */

export async function GET() {
  const user = await getSessionUser();
  if (!user || !hasRole(user, COMPLAINT_FIELD_ROLES)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  const admin = createAdminClient();
  const sessions = await listImportSessions(admin, user.id);
  kickImportWorker();
  return NextResponse.json({ sessions });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !hasRole(user, COMPLAINT_FIELD_ROLES)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  let body: { fileName?: string; fileSize?: number; fingerprint?: string; autoCommit?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const fileName = String(body.fileName ?? "").trim();
  const fileSize = Number(body.fileSize ?? 0);
  const fingerprint = String(body.fingerprint ?? "").trim();
  if (!fileName.toLowerCase().endsWith(".zip")) {
    return NextResponse.json({ error: "Please upload a .zip file." }, { status: 400 });
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json({ error: "Empty file." }, { status: 400 });
  }
  if (fileSize > MAX_IMPORT_ZIP_BYTES) {
    return NextResponse.json(
      { error: `ZIP too large (${(fileSize / 1_073_741_824).toFixed(1)} GB). Max ${Math.round(MAX_IMPORT_ZIP_BYTES / 1_073_741_824)} GB.` },
      { status: 400 },
    );
  }
  if (!fingerprint) return NextResponse.json({ error: "Missing file fingerprint." }, { status: 400 });

  const admin = createAdminClient();

  // Same file already in flight? Resume the upload / point at the running one
  // instead of importing the ZIP twice.
  const { data: existing } = await admin
    .from("import_uploads")
    .select("*")
    .eq("created_by", user.id)
    .eq("fingerprint", fingerprint)
    .in("status", ["uploading", "queued", "processing", "review"])
    .order("created_at", { ascending: false })
    .limit(1);
  const found = existing?.[0];
  if (found) {
    const snap = rowToSnapshot(found as Record<string, unknown>);
    if (snap.status === "uploading") {
      // Disk is the source of truth for how much actually landed.
      const onDisk = await stagedSize((found as Record<string, unknown>).staged_path as string);
      if (onDisk !== snap.receivedBytes) {
        await admin.from("import_uploads").update({ received_bytes: onDisk }).eq("id", snap.id);
        snap.receivedBytes = onDisk;
      }
    }
    return NextResponse.json({ session: snap, resumed: true });
  }

  const { data, error } = await admin
    .from("import_uploads")
    .insert({
      kind: "forensic_zip",
      file_name: fileName,
      file_size: fileSize,
      fingerprint,
      chunk_size: IMPORT_CHUNK_SIZE,
      status: "uploading",
      stage: "Uploading",
      progress: 0,
      message: "Waiting for the first chunk…",
      auto_commit: body.autoCommit !== false,
      created_by: user.id,
    })
    .select("*")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Could not create the upload session." }, { status: 500 });
  }
  const stagedPath = stagedPathFor(data.id as string);
  await admin.from("import_uploads").update({ staged_path: stagedPath }).eq("id", data.id);

  console.log(`[import-queue] session created id=${data.id} file=${fileName} size=${fileSize} user=${user.id}`);
  return NextResponse.json({ session: rowToSnapshot({ ...data, staged_path: stagedPath } as Record<string, unknown>), resumed: false });
}
