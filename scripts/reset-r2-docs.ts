/**
 * Clears job_documents / complaint_documents rows marked storage_bucket="r2"
 * for the given job number(s) — use this when the actual R2 objects are known
 * to be gone (e.g. the R2 folder was deleted) but the DB rows still claim
 * "already uploaded", which makes the forensic-import dedup logic skip every
 * file on re-import forever. Does NOT touch job_cases / complaints / job_audits
 * / letter_drafts — only the document/media rows, so a fresh ZIP re-import
 * will recreate them with a real upload attempt.
 *
 *   npx tsx scripts/reset-r2-docs.ts 209-26-000004 209-26-000007
 */
import * as dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

import { createClient } from "@supabase/supabase-js";

const jobNumbers = process.argv.slice(2);
if (!jobNumbers.length) {
  console.error("Usage: npx tsx scripts/reset-r2-docs.ts <job-number> [job-number...]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("\n✗ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (.env / .env.local).\n");
  process.exit(1);
}
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  console.log(`Clearing R2-flagged document rows for job number(s): ${jobNumbers.join(", ")}\n`);

  const { data: jobDocs, error: jdSelErr } = await admin
    .from("job_documents")
    .select("id, original_file_name")
    .in("job_number", jobNumbers)
    .eq("storage_bucket", "r2");
  if (jdSelErr) console.error("job_documents select failed:", jdSelErr.message);
  const jobDocIds = (jobDocs ?? []).map((d) => d.id as string);
  console.log(`job_documents: ${jobDocIds.length} row(s) to delete`);
  for (const d of jobDocs ?? []) console.log(`  - ${d.original_file_name}`);
  if (jobDocIds.length) {
    const { error } = await admin.from("job_documents").delete().in("id", jobDocIds);
    if (error) console.error("job_documents delete failed:", error.message);
    else console.log(`  deleted.`);
  }

  const { data: complaints } = await admin.from("complaints").select("id").in("job_number", jobNumbers);
  const complaintIds = (complaints ?? []).map((c) => c.id as string);
  if (complaintIds.length) {
    const { data: cDocs, error: cdSelErr } = await admin
      .from("complaint_documents")
      .select("id, original_file_name")
      .in("complaint_id", complaintIds)
      .eq("storage_bucket", "r2");
    if (cdSelErr) console.error("complaint_documents select failed:", cdSelErr.message);
    const cDocIds = (cDocs ?? []).map((d) => d.id as string);
    console.log(`\ncomplaint_documents: ${cDocIds.length} row(s) to delete`);
    for (const d of cDocs ?? []) console.log(`  - ${d.original_file_name}`);
    if (cDocIds.length) {
      const { error } = await admin.from("complaint_documents").delete().in("id", cDocIds);
      if (error) console.error("complaint_documents delete failed:", error.message);
      else console.log(`  deleted.`);
    }
  }

  console.log(
    "\nDone. Re-run the same ZIP import (batch_W209.zip) now — the dedup check will no longer\n" +
      "find these rows, so it will actually attempt uploadToR2() this time. Watch the terminal\n" +
      "for 'filesUploaded'/'filesFailed' counts and any 'file upload FAILED' lines.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
