/**
 * Diagnostic: for the given job number(s), check every job_documents /
 * complaint_documents row marked storage_bucket="r2" and verify the object
 * ACTUALLY exists in the R2 bucket (HeadObjectCommand) — distinguishes real
 * uploads from "phantom" rows left behind by a past silent upload failure
 * (the forensic-import dedup logic trusts storage_bucket="r2" as proof of a
 * successful upload; if that's wrong, re-imports skip the file forever).
 *
 *   npx tsx scripts/check-r2-media.ts 209-26-000004 209-26-000007
 *   npx tsx scripts/check-r2-media.ts            (defaults to the two job numbers below)
 */
import * as dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

import { createClient } from "@supabase/supabase-js";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";

const DEFAULT_JOBS = ["209-26-000004", "209-26-000007"];
const jobNumbers = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_JOBS;

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

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

async function objectExists(key: string): Promise<boolean> {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: bucket!, Key: key }));
    return true;
  } catch (e: any) {
    if (e?.$metadata?.httpStatusCode === 404 || e?.name === "NotFound") return false;
    console.warn(`  ! HeadObject error for ${key}: ${e?.message ?? e}`);
    return false;
  }
}

async function checkRows(
  label: string,
  rows: { name: string; bucket: string; path: string }[],
  counters: { total: number; real: number; phantom: number },
) {
  console.log(`\n=== ${label} (${rows.length} rows) ===`);
  for (const d of rows) {
    counters.total++;
    if (d.bucket !== "r2") {
      console.log(`  [non-r2]  ${d.name}  bucket=${d.bucket}`);
      continue;
    }
    const exists = await objectExists(d.path);
    if (exists) {
      counters.real++;
      console.log(`  [OK]      ${d.name}`);
    } else {
      counters.phantom++;
      console.log(`  [PHANTOM] ${d.name}  key=${d.path}`);
    }
  }
}

async function main() {
  console.log(`Checking R2 bucket "${bucket}" for job number(s): ${jobNumbers.join(", ")}`);
  const counters = { total: 0, real: 0, phantom: 0 };

  const { data: jobDocs, error: jdErr } = await admin
    .from("job_documents")
    .select("job_number, original_file_name, storage_bucket, storage_path")
    .in("job_number", jobNumbers);
  if (jdErr) console.error("job_documents query failed:", jdErr.message);
  await checkRows(
    "job_documents",
    (jobDocs ?? []).map((d) => ({ name: `${d.job_number} / ${d.original_file_name}`, bucket: d.storage_bucket as string, path: d.storage_path as string })),
    counters,
  );

  const { data: complaints } = await admin.from("complaints").select("id, job_number").in("job_number", jobNumbers);
  const complaintIds = (complaints ?? []).map((c) => c.id as string);
  if (complaintIds.length) {
    const { data: cDocs, error: cdErr } = await admin
      .from("complaint_documents")
      .select("original_file_name, storage_bucket, storage_path")
      .in("complaint_id", complaintIds);
    if (cdErr) console.error("complaint_documents query failed:", cdErr.message);
    await checkRows(
      "complaint_documents",
      (cDocs ?? []).map((d) => ({ name: d.original_file_name as string, bucket: d.storage_bucket as string, path: d.storage_path as string })),
      counters,
    );
  } else {
    console.log("\n(no complaints found for these job numbers)");
  }

  console.log("\n=== Summary ===");
  console.log(`Total rows checked: ${counters.total}`);
  console.log(`Really in R2:       ${counters.real}`);
  console.log(`Phantom (missing):  ${counters.phantom}`);
  if (counters.phantom > 0) {
    console.log(
      "\nPhantom rows found — these will keep blocking re-upload via the forensic-import dedup logic.\n" +
        "Delete them (job_documents / complaint_documents rows listed as [PHANTOM] above) and re-run\n" +
        "the same ZIP import to force a fresh upload attempt.",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
