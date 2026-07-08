import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StartupTask } from "./types";
import { StartupLogger } from "./logger";

const BUCKETS = [
  "complaint-documents",
  "complaint-evidence",
  "complaint-processed-images",
  "complaint-exports",
  "rti-documents",
  "job-documents",
];

export class StorageInitializationTask implements StartupTask {
  name = "Storage Services Initialization";
  critical = true;

  async run(): Promise<void> {
    const admin = createAdminClient();

    for (const b of BUCKETS) {
      const { error } = await admin.storage.createBucket(b, { public: false });
      if (error) {
        if (/already exists/i.test(error.message)) {
          // Normal behavior, bucket already exists
          continue;
        } else {
          throw new Error(`Failed to ensure storage bucket "${b}": ${error.message}`);
        }
      } else {
        StartupLogger.info(`  • Created private storage bucket: ${b}`);
      }
    }

    StartupLogger.info("All storage buckets verified.");
  }
}
