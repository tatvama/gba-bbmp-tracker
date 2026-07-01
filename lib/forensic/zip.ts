import "server-only";
import { unzipSync } from "fflate";
import { mkdir, writeFile, rm, readdir, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Safe in-memory ZIP reading for the forensic import. fflate's unzipSync over the
 * whole buffer (we hold it anyway). Guards against zip-slip path traversal and
 * zip-bomb blow-ups. Storage keys are ALWAYS derived via buildPath/safeName at the
 * call site — never from entry paths — so traversal can't escape regardless.
 */

export const MAX_ZIP_BYTES = 200 * 1024 * 1024; // reject before staging
const MAX_ENTRIES = 5000;
const MAX_TOTAL_UNCOMPRESSED = 800 * 1024 * 1024;

export interface ZipEntry {
  /** Path within the archive (or, after grouping, folder-relative). Forward slashes. */
  path: string;
  bytes: Uint8Array;
}

/** Reject absolute, drive-letter, parent-traversal or NUL-bearing paths. */
export function isUnsafePath(p: string): boolean {
  if (!p) return true;
  const norm = p.replace(/\\/g, "/");
  if (norm.includes("\0")) return true;
  if (norm.startsWith("/")) return true;
  if (/^[a-zA-Z]:/.test(norm)) return true; // C:\…
  if (norm.split("/").some((seg) => seg === "..")) return true;
  return false;
}

/** Decompress a ZIP buffer into safe file entries (directories + junk skipped). */
export function readZipEntries(zip: Buffer): ZipEntry[] {
  const files = unzipSync(new Uint8Array(zip));
  const entries: ZipEntry[] = [];
  let total = 0;
  let count = 0;
  for (const [rawPath, bytes] of Object.entries(files)) {
    const path = rawPath.replace(/\\/g, "/");
    if (!path || path.endsWith("/")) continue; // directory marker
    const base = path.split("/").pop() || "";
    if (path.includes("__MACOSX/") || base === ".DS_Store" || base.startsWith("._")) continue;
    if (isUnsafePath(path)) continue;
    count += 1;
    if (count > MAX_ENTRIES) throw new Error(`ZIP has too many files (> ${MAX_ENTRIES}).`);
    total += bytes.byteLength;
    if (total > MAX_TOTAL_UNCOMPRESSED) {
      throw new Error("ZIP uncompressed size is too large (possible zip bomb).");
    }
    entries.push({ path, bytes });
  }
  return entries;
}

export interface TopFolderGroup {
  folder: string;
  entries: ZipEntry[]; // entry paths are folder-relative
}

/** Group entries by their top-level folder (the job code). Root-level files are reported. */
export function groupByTopFolder(entries: ZipEntry[]): { groups: TopFolderGroup[]; rootFiles: string[] } {
  const map = new Map<string, ZipEntry[]>();
  const rootFiles: string[] = [];
  for (const e of entries) {
    const parts = e.path.split("/");
    if (parts.length < 2) {
      rootFiles.push(e.path);
      continue;
    }
    const folder = parts[0]!;
    const relPath = parts.slice(1).join("/");
    if (!relPath) continue;
    const arr = map.get(folder) ?? [];
    arr.push({ path: relPath, bytes: e.bytes });
    map.set(folder, arr);
  }
  const groups = [...map.entries()].map(([folder, es]) => ({ folder, entries: es }));
  return { groups, rootFiles };
}

// =============================================================================
// Disk-backed extraction (the forensic ZIP itself is never persisted — only
// extracted into a per-import temp directory so the analyze→review→commit
// flow has somewhere to read from without ever writing the ZIP to R2).
// =============================================================================

export interface ExtractedFile {
  /** Path within the archive (forward slashes), same as ZipEntry.path. */
  path: string;
  size: number;
}

/**
 * Decompress a ZIP and write every safe entry to disk under `tempRoot`
 * (creating parent directories as needed). Reuses readZipEntries for the
 * decompression + zip-slip/entry-count/size guards, then adds a SECOND,
 * filesystem-level zip-slip check: after joining tempRoot with the entry's
 * path, the RESOLVED absolute path must still be inside the resolved
 * tempRoot. This matters once real disk writes are involved — the earlier
 * string-based isUnsafePath check is defense-in-depth, not a substitute.
 * Returns a manifest ({path, size} — NOT bytes) so the caller doesn't hold
 * the (up to 800MB) decompressed set in memory any longer than this call.
 */
export async function extractZipToTempDir(zip: Buffer, tempRoot: string): Promise<ExtractedFile[]> {
  const entries = readZipEntries(zip); // in-memory decompress + existing safety checks
  const root = path.resolve(tempRoot);
  const manifest: ExtractedFile[] = [];
  for (const e of entries) {
    const target = path.resolve(root, e.path);
    if (target !== root && !target.startsWith(root + path.sep)) {
      // Should be unreachable (isUnsafePath already rejected traversal
      // strings), but this is the check that actually matters once real
      // filesystem writes are involved — never trust the string check alone.
      console.warn("[forensic/zip] extractZipToTempDir: blocked unsafe path", e.path);
      continue;
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, e.bytes);
    manifest.push({ path: e.path, size: e.bytes.byteLength });
  }
  return manifest;
  // `entries` (and every entry's decompressed bytes) goes out of scope here —
  // eligible for GC once this function returns. Callers get paths/sizes only.
}

export interface TempDirFile {
  /** Path relative to tempRoot, forward slashes (same shape as ZipEntry.path). */
  relPath: string;
  /** Absolute path on disk. */
  absPath: string;
  size: number;
}

/**
 * List every file under a temp dir written by extractZipToTempDir (recursive).
 * Returns [] (not a throw) if tempRoot doesn't exist — callers treat an empty
 * result as "extraction is gone, ask the user to re-upload" rather than a crash.
 */
export async function walkTempDir(tempRoot: string): Promise<TempDirFile[]> {
  const root = path.resolve(tempRoot);
  const out: TempDirFile[] = [];
  async function recurse(dir: string): Promise<void> {
    let items;
    try {
      items = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // dir missing (e.g. container restarted) — caller sees [] overall
    }
    for (const it of items) {
      const abs = path.join(dir, it.name);
      if (it.isDirectory()) {
        await recurse(abs);
      } else if (it.isFile()) {
        const st = await stat(abs).catch(() => null);
        out.push({ relPath: path.relative(root, abs).replace(/\\/g, "/"), absPath: abs, size: st?.size ?? 0 });
      }
    }
  }
  await recurse(root);
  return out;
}

/**
 * Best-effort recursive delete of a batch's temp dir (after commit, or after
 * an analyze-time extraction failure). Never throws — logs and swallows.
 */
export async function deleteTempDir(tempRoot: string): Promise<void> {
  try {
    await rm(tempRoot, { recursive: true, force: true });
  } catch (e) {
    console.warn("[forensic/zip] deleteTempDir failed", tempRoot, e);
  }
}
