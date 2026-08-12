/**
 * FULL RESET of all complaint + forensic/job-import data, in both the database
 * AND Cloudflare R2 storage, for a clean slate before re-importing ZIPs.
 *
 * Deliberately leaves untouched: rti_applications (+ children), wards,
 * contacts, corporations, divisions, eng_subdivisions, profiles/users.
 *
 * DESTRUCTIVE AND IRREVERSIBLE. Requires typing "DELETE EVERYTHING" to confirm.
 *
 *   npx tsx scripts/full-complaint-reset.ts
 */
import * as dotenv from "dotenv";
import path from "path";
import * as readline from "node:readline/promises";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

import { createDbClient } from "../lib/db";
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET_NAME;

if (!url || !serviceKey) {
  console.error("\n✗ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (.env / .env.local).\n");
  process.exit(1);
}
if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
  console.error("\n✗ R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME are required.\n");
  process.exit(1);
}

const admin = createDbClient();
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

// Whole tables — complaint/job/forensic-only, never shared with RTI.
const WHOLE_TABLES = [
  // complaint children
  "complaint_action_taken",
  "complaint_replies",
  "complaint_timeline",
  "complaint_ai_recommendations",
  "complaint_documents",
  // job/forensic children
  "photo_match_verdicts",
  "job_documents",
  "job_audits",
  "job_timeline_dates",
  "job_eligibility",
  "job_insurance",
  "job_running_bills",
  "letter_drafts",
  "forensic_import_batches",
  // parents (last)
  "job_cases",
  "complaints",
];

// Shared tables — only delete rows where entity_type = 'complaint', so RTI's
// rows (entity_type = 'rti') survive.
const FILTERED_TABLES = ["reminders", "ai_drafts", "communication_logs", "escalation_logs", "notifications", "background_jobs"];

async function deleteWholeTable(table: string) {
  const { error, count } = await admin.from(table).delete({ count: "exact" }).neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) console.error(`  ✗ ${table}: ${error.message}`);
  else console.log(`  ✓ ${table}: ${count ?? 0} row(s) deleted`);
}

async function deleteFilteredTable(table: string) {
  const { error, count } = await admin.from(table).delete({ count: "exact" }).eq("entity_type", "complaint");
  if (error) console.error(`  ✗ ${table} (entity_type=complaint): ${error.message}`);
  else console.log(`  ✓ ${table} (entity_type=complaint): ${count ?? 0} row(s) deleted`);
}

async function emptyR2Complaints() {
  let totalDeleted = 0;
  let continuationToken: string | undefined;
  console.log(`\nEmptying R2 bucket "${bucket}" under prefix "complaints/"...`);
  do {
    const list = await r2.send(new ListObjectsV2Command({ Bucket: bucket!, Prefix: "complaints/", ContinuationToken: continuationToken }));
    const objects = list.Contents ?? [];
    if (objects.length) {
      await r2.send(new DeleteObjectsCommand({ Bucket: bucket!, Delete: { Objects: objects.map((o) => ({ Key: o.Key! })), Quiet: true } }));
      totalDeleted += objects.length;
      console.log(`  deleted ${totalDeleted} object(s) so far...`);
    }
    continuationToken = list.NextContinuationToken;
  } while (continuationToken);
  console.log(`  done — ${totalDeleted} object(s) removed from R2.`);
}

async function main() {
  console.log("This will PERMANENTLY delete ALL complaints, job cases, and forensic-import");
  console.log("data from the database, AND empty the entire complaints/ prefix in R2.");
  console.log("RTI applications, wards, contacts, and corporations are NOT touched.\n");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Type "DELETE EVERYTHING" to confirm: ');
  rl.close();
  if (answer.trim() !== "DELETE EVERYTHING") {
    console.log("Aborted — no changes made.");
    process.exit(0);
  }

  console.log("\n=== Database ===");
  for (const t of WHOLE_TABLES) await deleteWholeTable(t);
  for (const t of FILTERED_TABLES) await deleteFilteredTable(t);

  await emptyR2Complaints();

  console.log("\nDone. You now have a clean slate — re-import your ZIP(s) to start fresh.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
