import "server-only";
import type { StartupTask } from "./types";
import { StartupLogger } from "./logger";

/**
 * Confirms object storage is reachable at startup.
 *
 * This used to create six private Supabase Storage buckets. R2 has a single
 * pre-existing bucket and treats each former bucket name as a key prefix (see
 * lib/storage/object-store.ts), so there is nothing to create — the useful check
 * is that the credentials work and the bucket answers.
 */
export class StorageInitializationTask implements StartupTask {
  name = "Storage Services Initialization";
  critical = true;

  async run(): Promise<void> {
    const required = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length) {
      throw new Error(`Object storage is not configured — missing ${missing.join(", ")}.`);
    }

    // HeadBucket is the cheapest authenticated call that proves both the
    // credentials and the bucket name are right.
    const { S3Client, HeadBucketCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });

    try {
      await client.send(new HeadBucketCommand({ Bucket: process.env.R2_BUCKET_NAME! }));
    } catch (e) {
      throw new Error(
        `Could not reach R2 bucket "${process.env.R2_BUCKET_NAME}": ` +
          (e instanceof Error ? e.message : String(e)),
      );
    }

    StartupLogger.info(`Object storage reachable: R2 bucket ${process.env.R2_BUCKET_NAME}`);
  }
}
