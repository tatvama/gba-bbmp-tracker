import "server-only";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, stat, writeFile, type FileHandle } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";
import path from "node:path";
import { isUnsafePath, type ExtractedFile } from "./zip";

/**
 * STREAMING ZIP extraction for the chunked-upload path. The legacy
 * extractZipToTempDir (lib/forensic/zip.ts) decompresses the whole archive in
 * memory — fine for ≤200 MB uploads, hopeless for the real 0.6–1.6 GB skill
 * exports. This reads the archive the way `unzip` itself does: parse the END
 * OF CENTRAL DIRECTORY for the authoritative entry list (name, sizes, local
 * offset), then stream each entry's exact byte range from disk through
 * Node's own zlib inflateRaw into its target file. Bounded memory (one
 * pipeline buffer at a time), real backpressure, no reliance on a push-parser
 * guessing entry boundaries (fflate's streaming Unzip choked mid-archive on
 * the real 1.5 GB export — "unexpected EOF" — while this path handles it).
 *
 * Same guards as the in-memory path: zip-slip string + resolved-path checks,
 * entry-count / total-uncompressed caps, junk filtering. ZIP64 archives are
 * supported (EOCD64 + per-entry 0x0001 extra fields).
 */

export const MAX_STREAM_ENTRIES = 20_000;
export const MAX_STREAM_TOTAL_UNCOMPRESSED = 8 * 1024 * 1024 * 1024; // 8 GiB

function isJunkEntry(relPath: string): boolean {
  const base = relPath.split("/").pop() || "";
  return relPath.includes("__MACOSX/") || base === ".DS_Store" || base.startsWith("._");
}

interface CdEntry {
  name: string;
  method: number; // 0 = stored, 8 = deflate
  compSize: number;
  uncompSize: number;
  localHeaderOffset: number;
}

/** Scan the file tail for the EOCD record (and its ZIP64 variant if present). */
async function readCentralDirectory(fh: FileHandle, fileSize: number): Promise<CdEntry[]> {
  // EOCD = 22 bytes + up to 65535 bytes of comment.
  const tailLen = Math.min(fileSize, 22 + 65_535 + 128);
  const tail = Buffer.alloc(tailLen);
  await fh.read(tail, 0, tailLen, fileSize - tailLen);
  let eocdPos = -1;
  for (let i = tailLen - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === 0x06054b50) {
      eocdPos = i;
      break;
    }
  }
  if (eocdPos < 0) throw new Error("Not a valid ZIP file (no end-of-central-directory record found).");

  let entryCount: number = tail.readUInt16LE(eocdPos + 10);
  let cdSize: number = tail.readUInt32LE(eocdPos + 12);
  let cdOffset: number = tail.readUInt32LE(eocdPos + 16);

  // ZIP64: sentinel values point at a ZIP64 EOCD via the locator just before the EOCD.
  if (entryCount === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    const locPos = eocdPos - 20;
    if (locPos < 0 || tail.readUInt32LE(locPos) !== 0x07064b50) {
      throw new Error("ZIP64 archive without a readable ZIP64 locator.");
    }
    const eocd64Offset = Number(tail.readBigUInt64LE(locPos + 8));
    const eocd64 = Buffer.alloc(56);
    await fh.read(eocd64, 0, 56, eocd64Offset);
    if (eocd64.readUInt32LE(0) !== 0x06064b50) throw new Error("Corrupt ZIP64 end-of-central-directory record.");
    entryCount = Number(eocd64.readBigUInt64LE(32));
    cdSize = Number(eocd64.readBigUInt64LE(40));
    cdOffset = Number(eocd64.readBigUInt64LE(48));
  }

  if (entryCount > MAX_STREAM_ENTRIES) throw new Error(`ZIP has too many files (> ${MAX_STREAM_ENTRIES}).`);
  if (cdOffset + cdSize > fileSize) throw new Error("Corrupt ZIP (central directory extends past the end of the file).");

  const cd = Buffer.alloc(cdSize);
  await fh.read(cd, 0, cdSize, cdOffset);

  const entries: CdEntry[] = [];
  let p = 0;
  for (let n = 0; n < entryCount && p + 46 <= cd.length; n++) {
    if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error("Corrupt ZIP central directory entry.");
    const flags = cd.readUInt16LE(p + 8);
    const method = cd.readUInt16LE(p + 10);
    let compSize: number = cd.readUInt32LE(p + 20);
    let uncompSize: number = cd.readUInt32LE(p + 24);
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const commentLen = cd.readUInt16LE(p + 32);
    let localHeaderOffset: number = cd.readUInt32LE(p + 42);
    const nameBytes = cd.subarray(p + 46, p + 46 + nameLen);
    // Bit 11 = the name is UTF-8; otherwise CP437 (latin1 is byte-identical for ASCII).
    const name = nameBytes.toString(flags & 0x800 ? "utf-8" : "latin1");

    // ZIP64 extra field (id 0x0001) overrides any 0xFFFFFFFF fields, in order:
    // uncompressed size, compressed size, local header offset.
    let ep = p + 46 + nameLen;
    const extraEnd = ep + extraLen;
    while (ep + 4 <= extraEnd) {
      const id = cd.readUInt16LE(ep);
      const len = cd.readUInt16LE(ep + 2);
      if (id === 0x0001) {
        let fp = ep + 4;
        if (uncompSize === 0xffffffff && fp + 8 <= ep + 4 + len) {
          uncompSize = Number(cd.readBigUInt64LE(fp));
          fp += 8;
        }
        if (compSize === 0xffffffff && fp + 8 <= ep + 4 + len) {
          compSize = Number(cd.readBigUInt64LE(fp));
          fp += 8;
        }
        if (localHeaderOffset === 0xffffffff && fp + 8 <= ep + 4 + len) {
          localHeaderOffset = Number(cd.readBigUInt64LE(fp));
        }
      }
      ep += 4 + len;
    }

    entries.push({ name, method, compSize, uncompSize, localHeaderOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** The entry's data begins after its LOCAL header (whose name/extra lengths can differ from the central copy). */
async function resolveDataStart(fh: FileHandle, e: CdEntry): Promise<number> {
  const lh = Buffer.alloc(30);
  await fh.read(lh, 0, 30, e.localHeaderOffset);
  if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error(`Corrupt ZIP local header for "${e.name}".`);
  const nameLen = lh.readUInt16LE(26);
  const extraLen = lh.readUInt16LE(28);
  return e.localHeaderOffset + 30 + nameLen + extraLen;
}

export interface StreamExtractProgress {
  /** compressed bytes consumed so far */
  bytesRead: number;
  /** total size of the ZIP file */
  totalBytes: number;
  filesDone: number;
  currentFile: string | null;
}

/**
 * Stream-extract a ZIP FILE (staged on disk) into `tempRoot`. Returns the same
 * manifest shape as extractZipToTempDir. Throws on structural errors, caps, or
 * disk-write failures; the caller cleans up tempRoot.
 */
export async function extractZipFileToTempDir(
  zipPath: string,
  tempRoot: string,
  onProgress?: (p: StreamExtractProgress) => void,
): Promise<ExtractedFile[]> {
  const root = path.resolve(tempRoot);
  await mkdir(root, { recursive: true });
  const totalBytes = (await stat(zipPath)).size;

  const fh = await open(zipPath, "r");
  try {
    const all = await readCentralDirectory(fh, totalBytes);

    // Filter to the entries we actually extract, with the same safety rules
    // as the in-memory path.
    const kept: { e: CdEntry; rel: string; target: string }[] = [];
    let totalUncompressed = 0;
    for (const e of all) {
      const rel = (e.name || "").replace(/\\/g, "/");
      if (!rel || rel.endsWith("/") || isJunkEntry(rel) || isUnsafePath(rel)) continue;
      const target = path.resolve(root, rel);
      if (target !== root && !target.startsWith(root + path.sep)) {
        console.warn("[forensic/zip-stream] blocked unsafe path", rel);
        continue;
      }
      if (e.method !== 0 && e.method !== 8) {
        throw new Error(`"${rel}" uses an unsupported ZIP compression method (${e.method}).`);
      }
      totalUncompressed += e.uncompSize;
      if (totalUncompressed > MAX_STREAM_TOTAL_UNCOMPRESSED) {
        throw new Error("ZIP uncompressed size is too large (possible zip bomb).");
      }
      kept.push({ e, rel, target });
    }

    const manifest: ExtractedFile[] = [];
    let bytesRead = 0;
    let filesDone = 0;
    let lastReport = 0;
    const report = (currentFile: string | null, force = false) => {
      const now = Date.now();
      if (!force && now - lastReport < 400) return;
      lastReport = now;
      onProgress?.({ bytesRead, totalBytes, filesDone, currentFile });
    };

    for (const { e, rel, target } of kept) {
      report(rel);
      await mkdir(path.dirname(target), { recursive: true });
      if (e.uncompSize === 0 || e.compSize === 0) {
        await writeFile(target, Buffer.alloc(0));
      } else {
        const dataStart = await resolveDataStart(fh, e);
        if (dataStart + e.compSize > totalBytes) {
          throw new Error(`ZIP appears truncated — "${rel}" extends past the end of the file.`);
        }
        const dataEnd = dataStart + e.compSize - 1;
        const source = createReadStream(zipPath, { start: dataStart, end: dataEnd, highWaterMark: 1024 * 1024 });
        // Progress DURING the entry too — a single source PDF can be 500 MB.
        const entryStart = bytesRead;
        source.on("data", (c: Buffer | string) => {
          bytesRead = Math.min(entryStart + e.compSize, bytesRead + (typeof c === "string" ? c.length : c.byteLength));
          report(rel);
        });
        const sink = createWriteStream(target);
        if (e.method === 8) {
          await pipeline(source, zlib.createInflateRaw(), sink);
        } else {
          await pipeline(source, sink);
        }
        const written = (await stat(target)).size;
        if (written !== e.uncompSize) {
          throw new Error(`"${rel}" extracted to ${written} bytes but the archive says ${e.uncompSize} — corrupt ZIP.`);
        }
        bytesRead = entryStart;
      }
      bytesRead += e.compSize;
      filesDone += 1;
      manifest.push({ path: rel, size: e.uncompSize });
      report(rel);
    }

    onProgress?.({ bytesRead: totalBytes, totalBytes, filesDone, currentFile: null });
    if (manifest.length === 0) throw new Error("ZIP contained no readable files.");
    return manifest;
  } finally {
    await fh.close();
  }
}
