import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { extractZipFileToTempDir } from "@/lib/forensic/zip-stream";
import { walkTempDir } from "@/lib/forensic/zip";
import { classifyRelPath, groupEntriesByJobCode, parseJob, type RawEntry } from "@/lib/forensic/parse-skill-output";

/**
 * REAL-SCALE integration check, opt-in via env (never runs in CI):
 *   REAL_ZIP="C:\path\to\001-24-000014.zip" npx vitest run __tests__/real-zip.integration.test.ts
 * Stream-extracts the actual multi-GB skill export and runs the same
 * grouping/parsing the import worker uses — proving memory behaviour, fflate
 * compatibility and the _AUDIT_REPORT dataset selection on real data.
 */

const REAL_ZIP = process.env.REAL_ZIP;
const TEXTUAL = new Set(["rich_json", "min_json", "text", "info"]);

describe.skipIf(!REAL_ZIP)("real skill-export ZIP", () => {
  it(
    "stream-extracts and parses the export without loading it into memory",
    async () => {
      const tempDir = await mkdtemp(path.join(os.tmpdir(), "real-zip-test-"));
      try {
        const t0 = Date.now();
        let lastPct = -1;
        const manifest = await extractZipFileToTempDir(REAL_ZIP!, tempDir, (p) => {
          const pct = Math.floor((p.bytesRead / p.totalBytes) * 10) * 10;
          if (pct !== lastPct) {
            lastPct = pct;
            console.log(`  extract ${pct}% (${p.filesDone} files, heap ${(process.memoryUsage().heapUsed / 1048576).toFixed(0)} MB, rss ${(process.memoryUsage().rss / 1048576).toFixed(0)} MB)`);
          }
        });
        const extractMs = Date.now() - t0;
        console.log(`  extracted ${manifest.length} files in ${(extractMs / 1000).toFixed(1)}s`);
        expect(manifest.length).toBeGreaterThan(10);

        // Same shape the import worker builds for the analyzer.
        const files = await walkTempDir(tempDir);
        const raw: RawEntry[] = files.map((f) => ({ relPath: f.relPath, size: f.size }));
        const absByRel = new Map(files.map((f) => [f.relPath, f.absPath] as const));
        for (const e of raw) {
          if (TEXTUAL.has(classifyRelPath(e.relPath))) {
            e.text = await readFile(absByRel.get(e.relPath)!, "utf-8");
          }
        }
        const grouped = groupEntriesByJobCode(raw);
        expect(grouped.size).toBeGreaterThanOrEqual(1);

        for (const [code, es] of grouped) {
          const job = parseJob(code, es);
          console.log(
            `  job ${job.jobCode}: source=${job.source} risk=${job.riskColour} files=${job.files.length} division=${job.dataset?.division ?? "—"} presence=${job.dataset?.document_presence ? "yes" : "no"}`,
          );
          expect(job.validCode).toBe(true);
          expect(job.source).toBe("json"); // all three real exports carry _FORENSIC_REPORT.json
          expect(job.dataset?.work).toBeTruthy();
          expect(job.letterText.length).toBeGreaterThan(100);
        }
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
    15 * 60 * 1000,
  );
});
