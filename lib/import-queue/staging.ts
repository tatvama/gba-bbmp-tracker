import "server-only";
import os from "node:os";
import path from "node:path";
import { mkdir, stat, open, unlink } from "node:fs/promises";

/**
 * Disk staging for chunked ZIP uploads. Each session appends into ONE
 * `<id>.zip.part` file under the OS temp dir — chunks arrive strictly in
 * order (the client sends sequentially and re-aligns from the server's
 * received_bytes after any retry), so append-at-offset with an fstat guard is
 * enough. The staged file survives dev-server restarts on the same PC, which
 * is what lets an interrupted upload resume after the browser (or the app)
 * comes back.
 */

const STAGING_ROOT = path.join(os.tmpdir(), "gba-import-staging");

export function stagedPathFor(sessionId: string): string {
  return path.join(STAGING_ROOT, `${sessionId}.zip.part`);
}

export async function ensureStagingDir(): Promise<void> {
  await mkdir(STAGING_ROOT, { recursive: true });
}

/** Bytes currently staged for a session file (0 when missing). */
export async function stagedSize(filePath: string): Promise<number> {
  try {
    return (await stat(filePath)).size;
  } catch {
    return 0;
  }
}

/**
 * Append one chunk at `offset`. The on-disk size must equal `offset` — if the
 * client and server disagree (double-send after a flaky retry, or a stale tab
 * resuming an already-advanced session), the append is refused and the caller
 * returns the real size so the client re-aligns. An exact duplicate of the
 * PREVIOUS chunk (offset + length == current size) is treated as already
 * applied — that's the "response was lost after a successful write" retry.
 */
export async function appendChunkAt(
  filePath: string,
  offset: number,
  data: Buffer,
): Promise<{ ok: boolean; size: number }> {
  await ensureStagingDir();
  const current = await stagedSize(filePath);
  if (current === offset + data.byteLength) return { ok: true, size: current }; // duplicate retry
  if (current !== offset) return { ok: false, size: current };
  const fh = await open(filePath, "a");
  try {
    await fh.write(data, 0, data.byteLength);
  } finally {
    await fh.close();
  }
  return { ok: true, size: current + data.byteLength };
}

/** Cheap sanity check that a completed staged file is really a ZIP. */
export async function looksLikeZip(filePath: string): Promise<boolean> {
  try {
    const fh = await open(filePath, "r");
    try {
      const buf = Buffer.alloc(4);
      await fh.read(buf, 0, 4, 0);
      return buf[0] === 0x50 && buf[1] === 0x4b; // "PK"
    } finally {
      await fh.close();
    }
  } catch {
    return false;
  }
}

/** Best-effort delete of a staged file (after processing, or on cancel). */
export async function deleteStagedFile(filePath: string | null | undefined): Promise<void> {
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch {
    /* already gone */
  }
}
