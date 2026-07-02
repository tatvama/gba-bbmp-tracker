/**
 * Deletes objects in the R2 bucket under complaints/ prefix based on the job numbers of the complaints in the DB.
 * Run with:  npx tsx scripts/delete-complaint-r2-files.ts
 */
import * as dotenv from "dotenv";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const accountId = process.env.R2_ACCOUNT_ID!;
const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;
const bucket = process.env.R2_BUCKET_NAME!;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !supabaseUrl || !supabaseServiceKey) {
  console.error("Missing R2 or Supabase env vars. Check your .env file.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

async function deleteR2FilesByJobNumbers() {
  console.log("Fetching complaints from database to retrieve job numbers...");
  const { data: complaints, error } = await supabase
    .from("complaints")
    .select("job_number")
    .not("job_number", "is", null);

  if (error) {
    console.error("Error fetching complaints:", error.message);
    return;
  }

  const jobNumbers = Array.from(new Set(complaints.map(c => c.job_number as string))).filter(Boolean);
  if (jobNumbers.length === 0) {
    console.log("No job numbers found in active complaints. Nothing to delete from R2.");
    return;
  }

  console.log(`Found job numbers: ${jobNumbers.join(", ")}`);

  for (const jobNo of jobNumbers) {
    const prefix = `complaints/${jobNo}/`;
    console.log(`Checking R2 objects under prefix: ${prefix}`);
    let totalDeleted = 0;
    let continuationToken: string | undefined;

    do {
      const list = await s3Client.send(
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

      await s3Client.send(
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

    if (totalDeleted > 0) {
      console.log(`  Deleted ${totalDeleted} objects for job number ${jobNo}.`);
    } else {
      console.log(`  No objects found for job number ${jobNo}.`);
    }
  }
}

deleteR2FilesByJobNumbers().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
