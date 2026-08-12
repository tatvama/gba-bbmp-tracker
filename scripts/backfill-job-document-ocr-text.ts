/**
 * Backfill ocr_clean_text on already-imported job_documents "Extracted text"
 * rows (the forensic skill's combined per-job OCR/extracted text). The commit
 * pipeline (lib/forensic/commit-runner.ts) previously uploaded this file to R2
 * but never copied its content into a queryable column — the fix there covers
 * future imports; this script backfills rows imported before that fix, pulling
 * the text back out of R2 (already uploaded, nothing re-downloaded from the
 * source ZIP) rather than requiring the original ZIP file.
 *
 *   npx tsx --tsconfig scripts/tsconfig.pipeline.json scripts/backfill-job-document-ocr-text.ts [job_number ...]
 *
 * With no arguments, backfills every "Extracted text" row missing ocr_clean_text.
 * With job numbers given, scopes to just those jobs.
 */
import { loadEnv } from "./db";
loadEnv();

async function main() {
  const { createAdminClient } = await import("@/lib/db");
  const { downloadFromR2ByKey } = await import("@/lib/storage/r2-upload");
  const { R2_STORAGE_SENTINEL } = await import("@/lib/constants");
  const admin = createAdminClient();

  const jobNumbers = process.argv.slice(2);

  let query = admin
    .from("job_documents")
    .select("id, job_number, storage_path, storage_bucket, ocr_clean_text")
    .eq("document_type", "Extracted text")
    .eq("storage_bucket", R2_STORAGE_SENTINEL);
  if (jobNumbers.length) query = query.in("job_number", jobNumbers);

  const { data: rows, error } = await query;
  if (error) { console.error("Query failed:", error.message); process.exit(1); }

  const pending = (rows ?? []).filter((r) => !r.ocr_clean_text || !String(r.ocr_clean_text).trim());
  console.log(`Found ${rows?.length ?? 0} "Extracted text" row(s)${jobNumbers.length ? ` for [${jobNumbers.join(", ")}]` : ""}; ${pending.length} missing ocr_clean_text.`);

  let backfilled = 0, failed = 0;
  for (const r of pending) {
    const buf = await downloadFromR2ByKey(r.storage_path as string);
    if (!buf) {
      console.warn(`  ✗ ${r.job_number}: could not download ${r.storage_path}`);
      failed++;
      continue;
    }
    const text = buf.toString("utf-8").trim();
    if (!text) {
      console.warn(`  ✗ ${r.job_number}: downloaded but empty text`);
      failed++;
      continue;
    }
    const { error: updErr } = await admin
      .from("job_documents")
      .update({ ocr_clean_text: text, ocr_status: "Completed" })
      .eq("id", r.id);
    if (updErr) {
      console.warn(`  ✗ ${r.job_number}: update failed — ${updErr.message}`);
      failed++;
      continue;
    }
    console.log(`  ✓ ${r.job_number}: backfilled ${text.length} chars`);
    backfilled++;
  }

  console.log(`\nDone. backfilled=${backfilled} failed=${failed} alreadyHadText=${(rows?.length ?? 0) - pending.length}`);
  process.exit(failed && !backfilled ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
