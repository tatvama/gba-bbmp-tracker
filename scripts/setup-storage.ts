/**
 * Creates the private Supabase Storage buckets used by the complaint module.
 * Idempotent (skips buckets that already exist).
 *
 *   npm run db:setup-storage
 *
 * Uploads also self-heal (lib/storage ensureBucket), so this is a convenience for
 * first-time setup / CI.
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./db";

loadEnv();

const BUCKETS = [
  "complaint-documents",
  "complaint-evidence",
  "complaint-processed-images",
  "complaint-exports",
  "rti-documents",
  "job-documents",
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("\n✗ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.\n");
    process.exit(1);
  }
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  console.log("→ Ensuring private storage buckets…\n");
  for (const b of BUCKETS) {
    const { error } = await admin.storage.createBucket(b, { public: false });
    if (error && !/already exists/i.test(error.message)) {
      console.error(`  ✗ ${b}: ${error.message}`);
    } else {
      console.log(`  ✓ ${b}${error ? " (already exists)" : ""}`);
    }
  }
  console.log("\n✓ Storage buckets ready (all private — access via signed URLs).");
}

main();
