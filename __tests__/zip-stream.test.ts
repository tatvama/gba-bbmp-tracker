import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { zipSync } from "fflate";
import { mkdtemp, writeFile, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { extractZipFileToTempDir } from "@/lib/forensic/zip-stream";

/**
 * Streaming extraction of a staged ZIP file — the path the chunked import
 * queue uses for the real 0.6–1.6 GB skill exports. Verifies content
 * fidelity, junk/traversal filtering, progress reporting and corrupt-input
 * failure without ever holding the archive in memory.
 */

let workDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(path.join(os.tmpdir(), "zip-stream-test-"));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

function buildZip(entries: Record<string, Uint8Array>): Uint8Array {
  return zipSync(entries);
}

describe("extractZipFileToTempDir", () => {
  it("extracts nested entries to disk with exact bytes and returns a manifest", async () => {
    const big = new Uint8Array(3 * 1024 * 1024); // multi-chunk write path
    for (let i = 0; i < big.length; i++) big[i] = i % 251;
    const zipBytes = buildZip({
      "001-24-000003/info.txt": new TextEncoder().encode("Job Code : 001-24-000003"),
      "001-24-000003/_AUDIT_REPORT/001-24-000003_FORENSIC_REPORT.json": new TextEncoder().encode('{"code":"001-24-000003"}'),
      "001-24-000003/BA-huge-EMB.pdf": big,
    });
    const zipPath = path.join(workDir, "ok.zip");
    await writeFile(zipPath, zipBytes);

    const outDir = path.join(workDir, "out-ok");
    const progress: number[] = [];
    const manifest = await extractZipFileToTempDir(zipPath, outDir, (p) => progress.push(p.bytesRead));

    expect(manifest.map((m) => m.path).sort()).toEqual([
      "001-24-000003/BA-huge-EMB.pdf",
      "001-24-000003/_AUDIT_REPORT/001-24-000003_FORENSIC_REPORT.json",
      "001-24-000003/info.txt",
    ]);
    const written = await readFile(path.join(outDir, "001-24-000003", "BA-huge-EMB.pdf"));
    expect(written.byteLength).toBe(big.byteLength);
    expect(written.equals(Buffer.from(big))).toBe(true);
    const info = await readFile(path.join(outDir, "001-24-000003", "info.txt"), "utf-8");
    expect(info).toContain("001-24-000003");
    // final progress callback reports the full compressed size
    expect(progress[progress.length - 1]).toBe((await stat(zipPath)).size);
  });

  it("skips junk and traversal entries but keeps the good ones", async () => {
    const zipBytes = buildZip({
      "job/real.pdf": new TextEncoder().encode("%PDF-fake"),
      "__MACOSX/job/._real.pdf": new TextEncoder().encode("junk"),
      "job/.DS_Store": new TextEncoder().encode("junk"),
      "../evil.txt": new TextEncoder().encode("nope"),
    });
    const zipPath = path.join(workDir, "junk.zip");
    await writeFile(zipPath, zipBytes);

    const outDir = path.join(workDir, "out-junk");
    const manifest = await extractZipFileToTempDir(zipPath, outDir);
    expect(manifest.map((m) => m.path)).toEqual(["job/real.pdf"]);
    await expect(stat(path.join(workDir, "evil.txt"))).rejects.toThrow();
  });

  it("throws on a file truncated mid-entry instead of hanging", async () => {
    // Incompressible payload so the deflate stream is ~as long as the data —
    // cutting the file at 50% guarantees the entry's bytes are incomplete.
    const noise = new Uint8Array(64 * 1024);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) % 256;
    const zipBytes = buildZip({ "a/noise.bin": noise });
    const zipPath = path.join(workDir, "bad.zip");
    await writeFile(zipPath, zipBytes.slice(0, Math.floor(zipBytes.length / 2)));
    const outDir = path.join(workDir, "out-bad");
    await expect(extractZipFileToTempDir(zipPath, outDir)).rejects.toThrow();
  });

  it("throws when the ZIP has no readable files", async () => {
    const zipBytes = buildZip({ "__MACOSX/only-junk.txt": new TextEncoder().encode("x") });
    const zipPath = path.join(workDir, "empty.zip");
    await writeFile(zipPath, zipBytes);
    await expect(extractZipFileToTempDir(zipPath, path.join(workDir, "out-empty"))).rejects.toThrow(/no readable files/i);
  });
});
