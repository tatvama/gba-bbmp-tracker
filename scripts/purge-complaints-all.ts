import { createDbClient } from "../lib/db";
import * as dotenv from "dotenv";
import path from "path";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase configuration.");
  process.exit(1);
}

const db = createDbClient();

// R2 Config
const accountId = process.env.R2_ACCOUNT_ID!;
const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;
const bucket = process.env.R2_BUCKET_NAME!;

const hasR2Config = accountId && accessKeyId && secretAccessKey && bucket;

async function deleteTableData(tableName: string) {
  console.log(`Deleting all records from table: ${tableName}...`);
  const { error } = await db
    .from(tableName)
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (error) {
    console.error(`Error deleting from ${tableName}:`, error.message);
    return false;
  }
  console.log(`Successfully cleared ${tableName}.`);
  return true;
}

async function purgeR2ComplaintsByJobNumbers(jobNumbers: string[]) {
  if (!hasR2Config) {
    console.log("R2 credentials not fully configured. Skipping R2 purge.");
    return;
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  console.log(`Starting R2 cleanup for job numbers: ${jobNumbers.join(", ")}`);

  for (const jobNo of jobNumbers) {
    const prefix = `complaints/${jobNo}/`;
    let totalDeleted = 0;
    let continuationToken: string | undefined;

    console.log(`Deleting objects under prefix: ${prefix} in R2`);

    do {
      const list = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      );

      const objects = list.Contents ?? [];
      if (objects.length === 0) {
        break;
      }

      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: objects.map((o) => ({ Key: o.Key! })),
            Quiet: true,
          },
        })
      );

      totalDeleted += objects.length;
      continuationToken = list.NextContinuationToken;
    } while (continuationToken);

    console.log(`  Deleted ${totalDeleted} objects for job number ${jobNo}.`);
  }
}

async function run() {
  console.log("--- Starting Fresh Purge of Complaints and Related Data ---");

  // 1. Fetch job numbers from complaints before deleting database rows
  let jobNumbers: string[] = [];
  try {
    const { data: complaints, error } = await db
      .from("complaints")
      .select("job_number")
      .not("job_number", "is", null);

    if (error) {
      console.error("Could not fetch complaints to get job numbers:", error.message);
    } else {
      jobNumbers = Array.from(new Set(complaints.map(c => c.job_number as string))).filter(Boolean);
    }
  } catch (e) {
    console.error("Failed to query job numbers:", e);
  }

  // 2. Purge R2 Storage by Job Numbers
  if (jobNumbers.length > 0) {
    try {
      await purgeR2ComplaintsByJobNumbers(jobNumbers);
    } catch (e) {
      console.error("Failed to purge R2 storage:", e);
    }
  } else {
    console.log("No active complaints with job numbers. Skipping R2 deletion.");
  }

  // 3. Clear Database Tables in correct dependency order
  const tables = [
    // Complaint child tables
    "complaint_action_taken",
    "complaint_replies",
    "complaint_timeline",
    "complaint_documents",
    
    // Job/import child tables
    "job_documents",
    "job_cases",
    "job_download_runs",
    "forensic_import_batches",

    // Main complaint table
    "complaints"
  ];

  for (const table of tables) {
    try {
      await deleteTableData(table);
    } catch (e) {
      console.error(`Exception clearing ${table}:`, e);
    }
  }

  console.log("--- Purge Complete. Ready for Fresh Start! ---");
}

run().catch((err) => {
  console.error("Fatal error:", err);
});
