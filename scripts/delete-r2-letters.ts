/**
 * Deletes every object under the `letters/` prefix in the R2 bucket.
 * Run with:  npx tsx scripts/delete-r2-letters.ts
 */
import * as dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

const accountId = process.env.R2_ACCOUNT_ID!;
const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;
const bucket = process.env.R2_BUCKET_NAME!;

if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
  console.error("Missing R2 env vars. Check your .env.local file.");
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

async function deleteAllLetters() {
  let totalDeleted = 0;
  let continuationToken: string | undefined;

  console.log(`Deleting all objects under letters/ in bucket: ${bucket}`);

  do {
    const list = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: "letters/",
        ContinuationToken: continuationToken,
      })
    );

    const objects = list.Contents ?? [];
    if (objects.length === 0) break;

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
    console.log(`  Deleted ${totalDeleted} objects so far...`);
    continuationToken = list.NextContinuationToken;
  } while (continuationToken);

  console.log(`Done. Total deleted: ${totalDeleted} objects.`);
}

deleteAllLetters().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
