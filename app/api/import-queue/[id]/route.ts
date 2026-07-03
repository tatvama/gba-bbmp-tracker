import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { bandProgress } from "@/lib/import-queue/types";
import { getImportSession, updateImportSession } from "@/lib/import-queue/store";
import { appendChunkAt, deleteStagedFile, looksLikeZip, stagedPathFor } from "@/lib/import-queue/staging";
import { kickImportWorker } from "@/lib/import-queue/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One upload session.
 *   PUT    ?offset=N  → append one chunk (raw bytes). Chunks are sent strictly
 *                       in order; on an offset mismatch the response carries
 *                       the server's receivedBytes so the client re-aligns.
 *                       The last chunk flips the session to 'queued' and kicks
 *                       the worker.
 *   GET               → current snapshot (poll fallback).
 *   DELETE            → cancel (only while uploading/queued).
 */

async function authed() {
  const user = await getSessionUser();
  if (!user || !hasRole(user, COMPLAINT_FIELD_ROLES)) return null;
  return user;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authed();
  if (!user) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const { id } = await params;

  const admin = createAdminClient();
  const session = await getImportSession(admin, id);
  if (!session || session.createdBy !== user.id) {
    return NextResponse.json({ error: "Upload session not found." }, { status: 404 });
  }
  if (session.status !== "uploading") {
    return NextResponse.json({ error: `Upload is ${session.status} — cannot append.`, status: session.status }, { status: 409 });
  }

  const offset = Number(req.nextUrl.searchParams.get("offset") ?? "-1");
  if (!Number.isFinite(offset) || offset < 0) {
    return NextResponse.json({ error: "Missing chunk offset." }, { status: 400 });
  }
  const bytes = Buffer.from(await req.arrayBuffer());
  if (!bytes.byteLength) return NextResponse.json({ error: "Empty chunk." }, { status: 400 });
  if (bytes.byteLength > session.chunkSize + 1024) {
    return NextResponse.json({ error: "Chunk larger than the agreed chunk size." }, { status: 400 });
  }
  if (offset + bytes.byteLength > session.fileSize) {
    return NextResponse.json({ error: "Chunk exceeds the declared file size." }, { status: 400 });
  }

  const stagedPath = session.stagedPath || stagedPathFor(id);
  const appended = await appendChunkAt(stagedPath, offset, bytes);
  if (!appended.ok) {
    // Client is out of sync (flaky retry / stale tab) — hand back the truth.
    return NextResponse.json({ receivedBytes: appended.size, realign: true }, { status: 409 });
  }

  const received = appended.size;
  const complete = received >= session.fileSize;

  if (!complete) {
    // Progress row update (upload occupies 0→35 % of the overall bar). Chunks
    // land every couple of seconds — a plain update per chunk is fine.
    await updateImportSession(admin, id, {
      received_bytes: received,
      staged_path: stagedPath,
      progress: bandProgress("upload", received / session.fileSize),
      message: `Uploading… ${(received / 1_048_576).toFixed(0)} / ${(session.fileSize / 1_048_576).toFixed(0)} MB`,
    });
    return NextResponse.json({ receivedBytes: received, complete: false });
  }

  if (!(await looksLikeZip(stagedPath))) {
    await deleteStagedFile(stagedPath);
    await updateImportSession(
      admin,
      id,
      { status: "failed", error: "The uploaded file is not a ZIP archive.", received_bytes: received, finished_at: new Date().toISOString() },
      { stage: "Failed", msg: "The uploaded file is not a ZIP archive." },
    );
    return NextResponse.json({ error: "The uploaded file is not a ZIP archive." }, { status: 400 });
  }

  await updateImportSession(
    admin,
    id,
    {
      received_bytes: received,
      staged_path: stagedPath,
      status: "queued",
      stage: "Waiting in queue",
      progress: bandProgress("upload", 1),
      message: "Upload complete — waiting for the import worker.",
    },
    { stage: "Uploaded", msg: `Upload complete (${(received / 1_048_576).toFixed(0)} MB).` },
  );
  console.log(`[import-queue] upload complete id=${id} bytes=${received} user=${user.id}`);
  kickImportWorker();
  return NextResponse.json({ receivedBytes: received, complete: true });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authed();
  if (!user) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const { id } = await params;
  const admin = createAdminClient();
  const session = await getImportSession(admin, id);
  if (!session || session.createdBy !== user.id) {
    return NextResponse.json({ error: "Upload session not found." }, { status: 404 });
  }
  const { stagedPath: _sp, createdBy: _cb, ...snap } = session;
  return NextResponse.json({ session: snap });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authed();
  if (!user) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const { id } = await params;
  const admin = createAdminClient();
  const session = await getImportSession(admin, id);
  if (!session || session.createdBy !== user.id) {
    return NextResponse.json({ error: "Upload session not found." }, { status: 404 });
  }
  if (session.status !== "uploading" && session.status !== "queued" && session.status !== "review") {
    return NextResponse.json({ error: `Cannot cancel a ${session.status} import.` }, { status: 409 });
  }
  await deleteStagedFile(session.stagedPath);
  await updateImportSession(
    admin,
    id,
    { status: "cancelled", finished_at: new Date().toISOString(), message: "Cancelled." },
    { stage: "Cancelled", msg: "Cancelled by the user." },
  );
  return NextResponse.json({ ok: true });
}
