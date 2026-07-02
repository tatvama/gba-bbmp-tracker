import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { appendChunkAt, looksLikeZip, stagedSize } from "@/lib/import-queue/staging";
import { bandProgress, fileFingerprint, PROGRESS_BANDS } from "@/lib/import-queue/types";

let workDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(path.join(os.tmpdir(), "import-queue-test-"));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("staging appendChunkAt", () => {
  it("appends strictly in order and reports the running size", async () => {
    const f = path.join(workDir, "a.part");
    const c1 = Buffer.from("hello ");
    const c2 = Buffer.from("world");
    expect(await appendChunkAt(f, 0, c1)).toEqual({ ok: true, size: 6 });
    expect(await appendChunkAt(f, 6, c2)).toEqual({ ok: true, size: 11 });
    expect(await stagedSize(f)).toBe(11);
  });

  it("refuses an out-of-order chunk and returns the real size for re-alignment", async () => {
    const f = path.join(workDir, "b.part");
    await appendChunkAt(f, 0, Buffer.from("0123456789"));
    const r = await appendChunkAt(f, 4, Buffer.from("xxxx")); // stale offset
    expect(r.ok).toBe(false);
    expect(r.size).toBe(10);
  });

  it("treats an exact duplicate of the previous chunk as already applied", async () => {
    const f = path.join(workDir, "c.part");
    const chunk = Buffer.from("abcdef");
    await appendChunkAt(f, 0, chunk);
    // retry of the same PUT after a lost response
    const r = await appendChunkAt(f, 0, chunk);
    expect(r).toEqual({ ok: true, size: 6 });
    expect(await stagedSize(f)).toBe(6); // no double-write
  });
});

describe("looksLikeZip", () => {
  it("accepts a PK header and rejects anything else", async () => {
    const zip = path.join(workDir, "z.part");
    await writeFile(zip, Buffer.from("PK\x03\x04rest-of-zip"));
    const txt = path.join(workDir, "t.part");
    await writeFile(txt, Buffer.from("plain text"));
    expect(await looksLikeZip(zip)).toBe(true);
    expect(await looksLikeZip(txt)).toBe(false);
    expect(await looksLikeZip(path.join(workDir, "missing.part"))).toBe(false);
  });
});

describe("progress bands", () => {
  it("moves monotonically through the pipeline", () => {
    expect(bandProgress("upload", 0)).toBe(PROGRESS_BANDS.upload[0]);
    expect(bandProgress("upload", 1)).toBe(PROGRESS_BANDS.upload[1]);
    expect(bandProgress("extract", 0)).toBe(PROGRESS_BANDS.extract[0]);
    expect(bandProgress("commit", 1)).toBe(PROGRESS_BANDS.commit[1]);
    // clamped
    expect(bandProgress("analyze", -1)).toBe(PROGRESS_BANDS.analyze[0]);
    expect(bandProgress("analyze", 2)).toBe(PROGRESS_BANDS.analyze[1]);
  });
});

describe("fileFingerprint", () => {
  it("is stable for the same identity and differs when the file changes", () => {
    const a = fileFingerprint({ name: "001-24-000003.zip", size: 664096450, lastModified: 1751437000000 });
    const b = fileFingerprint({ name: "001-24-000003.zip", size: 664096450, lastModified: 1751437000000 });
    const c = fileFingerprint({ name: "001-24-000003.zip", size: 664096451, lastModified: 1751437000000 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
