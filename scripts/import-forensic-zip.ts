/**
 * CLI bulk import of forensic-skill ZIPs — the exact pipeline the in-app
 * import queue runs (stream-extract → analyze → commit → complaints), without
 * the browser upload step. Useful for multi-GB files sitting on the server's
 * own disk, or for scripted batch imports.
 *
 *   npx tsx --tsconfig scripts/tsconfig.pipeline.json scripts/import-forensic-zip.ts <zip> [more.zip ...]
 *
 * Flags:
 *   --user <profile-id>   created_by for job cases/complaints (default: first ADMIN profile)
 *   --review              analyze only (no complaints created) — review in the app UI
 *
 * Requires .env with SUPABASE + R2 credentials (same as the app).
 */
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { stat } from "node:fs/promises";
import { loadEnv } from "./db";

loadEnv();

async function main() {
  // Dynamic imports AFTER loadEnv so lib modules see the env vars.
  const { createAdminClient } = await import("@/lib/db");
  const { extractZipFileToTempDir } = await import("@/lib/forensic/zip-stream");
  const { processForensicBatch } = await import("@/lib/forensic/import-runner");
  const { commitForensicJobs } = await import("@/lib/forensic/commit-runner");
  const { deleteTempDir } = await import("@/lib/forensic/zip");

  const args = process.argv.slice(2);
  const reviewOnly = args.includes("--review");
  const userFlag = args.indexOf("--user");
  const userIdArg = userFlag >= 0 ? args[userFlag + 1] : undefined;
  const zips = args.filter((a, i) => !a.startsWith("--") && (userFlag < 0 || i !== userFlag + 1));

  if (!zips.length) {
    console.error("Usage: npx tsx --tsconfig scripts/tsconfig.pipeline.json scripts/import-forensic-zip.ts <zip> [more.zip ...] [--review] [--user <profile-id>]");
    process.exit(1);
  }

  const admin = createAdminClient();

  let userId = userIdArg;
  if (!userId) {
    const { data } = await admin.from("profiles").select("id, role, email").eq("role", "ADMIN").limit(1);
    userId = data?.[0]?.id as string | undefined;
    if (!userId) {
      console.error("✗ No ADMIN profile found — pass --user <profile-id>.");
      process.exit(1);
    }
    console.log(`→ Importing as ${data?.[0]?.email ?? userId}`);
  }

  for (const zip of zips) {
    const zipPath = path.resolve(zip);
    const size = (await stat(zipPath)).size;
    console.log(`\n══ ${path.basename(zipPath)} (${(size / 1_048_576).toFixed(0)} MB) ══`);

    const tempDir = path.join(os.tmpdir(), "gba-forensic-import", randomUUID());
    try {
      // 1) Extract
      let lastPct = -1;
      const manifest = await extractZipFileToTempDir(zipPath, tempDir, (p) => {
        const pct = Math.floor((p.bytesRead / p.totalBytes) * 20) * 5;
        if (pct !== lastPct) {
          lastPct = pct;
          process.stdout.write(`\r  extracting… ${pct}% (${p.filesDone} files)   `);
        }
      });
      console.log(`\r  ✓ extracted ${manifest.length} files                    `);

      // 2) Analyze via the standard batch pipeline
      const { data: batchRow, error: bErr } = await admin
        .from("forensic_import_batches")
        .insert({
          status: "Processing",
          extract_dir: tempDir,
          original_file_name: path.basename(zipPath),
          zip_size: size,
          created_by: userId,
        })
        .select("id")
        .single();
      if (bErr || !batchRow) throw new Error(bErr?.message || "could not create batch");
      const batchId = batchRow.id as string;

      await processForensicBatch(batchId, tempDir, (p) => {
        process.stdout.write(`\r  analyzing… ${Math.round(p.fraction * 100)}% ${p.message.slice(0, 60)}   `);
      });
      const { data: batch } = await admin.from("forensic_import_batches").select("status, jobs, error").eq("id", batchId).single();
      if (!batch || batch.status === "Failed") throw new Error((batch?.error as string) || "analysis failed");
      const jobs = (batch.jobs as import("@/lib/forensic/skill-output").ForensicJobResult[]) ?? [];
      console.log(`\r  ✓ analyzed: ${jobs.map((j) => `${j.jobCode} [${j.source}${j.riskColour ? ` ${j.riskColour}` : ""}]`).join(", ")}`);

      if (reviewOnly) {
        console.log(`  → review in the app: /complaints/import?import=${batchId}`);
        continue; // temp dir intentionally kept: the review-commit needs it
      }

      // 3) Commit → complaints (+ R2 uploads)
      const result = await commitForensicJobs(admin, {
        batchId,
        tempDirPath: tempDir,
        jobs,
        userId,
        onProgress: (p) => process.stdout.write(`\r  committing… ${Math.round(p.fraction * 100)}% ${p.message.slice(0, 70)}   `),
      });
      if (result.error || !result.success) throw new Error(result.error || "commit failed");
      console.log("\r  ✓ committed                                                                     ");
      for (const pj of result.perJob ?? []) {
        if (pj.error) console.log(`    ✗ ${pj.jobCode}: ${pj.error}`);
        else console.log(`    ✓ ${pj.jobCode} → complaint ${pj.complaintId} (${pj.filesUploaded}/${pj.filesTotal} files stored${pj.filesFailed?.length ? `, ${pj.filesFailed.length} FAILED` : ""})`);
      }
      console.log(`  summary: ${JSON.stringify(result.summary)}`);
    } catch (e) {
      console.error(`\n  ✗ ${path.basename(zipPath)} failed:`, e instanceof Error ? e.message : e);
      await deleteTempDir(tempDir);
      process.exitCode = 1;
    }
  }

  // The commit fires advisor/dedupe follow-ups without awaiting them — give
  // them a beat, then let the process exit (they're best-effort).
  await new Promise((r) => setTimeout(r, 1500));
  console.log("\nDone.");
  process.exit(process.exitCode ?? 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
