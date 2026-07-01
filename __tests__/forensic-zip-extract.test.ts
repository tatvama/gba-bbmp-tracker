import { describe, it, expect, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { zipSync, strToU8 } from "fflate";
import { isUnsafePath, extractZipToTempDir, walkTempDir, deleteTempDir } from "@/lib/forensic/zip";

const tempRoots: string[] = [];
async function freshTempRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "forensic-zip-test-"));
  tempRoots.push(dir);
  return dir;
}
afterEach(async () => {
  for (const d of tempRoots.splice(0)) await rm(d, { recursive: true, force: true }).catch(() => {});
});

describe("isUnsafePath (zip-slip guard, first line of defense)", () => {
  it("rejects parent-traversal, absolute, drive-letter, and NUL-bearing paths", () => {
    expect(isUnsafePath("../../etc/passwd")).toBe(true);
    expect(isUnsafePath("a/../../b")).toBe(true);
    expect(isUnsafePath("/etc/passwd")).toBe(true);
    expect(isUnsafePath("C:\\Windows\\System32\\evil.dll")).toBe(true);
    expect(isUnsafePath("a\0b")).toBe(true);
    expect(isUnsafePath("")).toBe(true);
  });
  it("accepts ordinary relative paths (including nested folders)", () => {
    expect(isUnsafePath("209-26-000004/WO-1-Estimate.pdf")).toBe(false);
    expect(isUnsafePath("_AUDIT_OUTPUT/letters/Job_209-26-000004_complaint_KN.docx")).toBe(false);
  });
});

describe("extractZipToTempDir + walkTempDir + deleteTempDir (real disk I/O)", () => {
  it("extracts a nested ZIP to disk, walkTempDir lists every file with correct content, deleteTempDir removes it all", async () => {
    const tempRoot = await freshTempRoot();
    const zip = zipSync({
      "batch_W209/209-26-000004/info.txt": strToU8("Job Code: 209-26-000004"),
      "batch_W209/_AUDIT_OUTPUT/data/209-26-000004.json": strToU8(JSON.stringify({ code: "209-26-000004" })),
      "batch_W209/_AUDIT_OUTPUT/letters/Job_209-26-000004_complaint_KN.docx": strToU8("letter bytes"),
    });

    const manifest = await extractZipToTempDir(Buffer.from(zip), tempRoot);
    expect(manifest.length).toBe(3);
    expect(manifest.map((m) => m.path).sort()).toEqual(
      [
        "batch_W209/209-26-000004/info.txt",
        "batch_W209/_AUDIT_OUTPUT/data/209-26-000004.json",
        "batch_W209/_AUDIT_OUTPUT/letters/Job_209-26-000004_complaint_KN.docx",
      ].sort(),
    );

    const walked = await walkTempDir(tempRoot);
    expect(walked.length).toBe(3);
    const infoFile = walked.find((f) => f.relPath.endsWith("info.txt"));
    expect(infoFile).toBeTruthy();
    const content = await readFile(infoFile!.absPath, "utf8");
    expect(content).toBe("Job Code: 209-26-000004");
    expect(infoFile!.size).toBe(Buffer.byteLength("Job Code: 209-26-000004"));

    await deleteTempDir(tempRoot);
    expect(await walkTempDir(tempRoot)).toEqual([]); // gone — walkTempDir degrades to [] rather than throwing
  });

  it("a ZIP with a zip-slip path never gets written to disk at all (rejected upstream by isUnsafePath, inside readZipEntries)", async () => {
    const tempRoot = await freshTempRoot();
    const zip = zipSync({
      "safe.txt": strToU8("fine"),
      "../../evil.txt": strToU8("should never land on disk"),
    });

    const manifest = await extractZipToTempDir(Buffer.from(zip), tempRoot);
    // Only the safe entry is extracted; the traversal entry is dropped before
    // extractZipToTempDir's loop (and its defense-in-depth resolved-path
    // check) ever sees it — readZipEntries's isUnsafePath already filtered it.
    expect(manifest.map((m) => m.path)).toEqual(["safe.txt"]);

    const walked = await walkTempDir(tempRoot);
    expect(walked.map((f) => f.relPath)).toEqual(["safe.txt"]);
    // Confirm nothing was written outside tempRoot (the parent-of-parent dir).
    const escapedPath = path.resolve(tempRoot, "..", "..", "evil.txt");
    await expect(readFile(escapedPath)).rejects.toThrow();

    await deleteTempDir(tempRoot);
  });

  it("walkTempDir returns [] (not a throw) for a directory that doesn't exist", async () => {
    const missing = path.join(os.tmpdir(), "forensic-zip-test-does-not-exist-" + Date.now());
    expect(await walkTempDir(missing)).toEqual([]);
  });

  it("deleteTempDir on a missing directory never throws (best-effort)", async () => {
    const missing = path.join(os.tmpdir(), "forensic-zip-test-does-not-exist-" + Date.now());
    await expect(deleteTempDir(missing)).resolves.toBeUndefined();
  });
});
