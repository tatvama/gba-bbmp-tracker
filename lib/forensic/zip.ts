import "server-only";
import { unzipSync } from "fflate";

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
