import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase configuration.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  console.log("Starting deletion of ALL complaints and related data from database (leaving R2 untouched)...");

  // 1. Fetch all complaints
  const { data: complaints, error: fetchErr } = await supabase
    .from("complaints")
    .select("id, internal_case_number, job_number");

  if (fetchErr) {
    console.error("Error fetching complaints:", fetchErr.message);
    return;
  }

  if (!complaints || complaints.length === 0) {
    console.log("No complaints found in the database.");
  } else {
    const idsToDelete = complaints.map((c) => c.id);
    console.log(`Found ${complaints.length} complaints to delete.`);

    // 2. Delete child records for all complaints
    const childTables = [
      "complaint_action_taken",
      "complaint_replies",
      "complaint_timeline",
      "complaint_documents"
    ];

    for (const table of childTables) {
      const { error } = await supabase
        .from(table)
        .delete()
        .in("complaint_id", idsToDelete);

      if (error) {
        console.error(`Error deleting from ${table}:`, error.message);
      } else {
        console.log(`Cleared matching records from ${table}.`);
      }
    }

    // 3. Delete the main complaints
    const { error: compErr } = await supabase
      .from("complaints")
      .delete()
      .in("id", idsToDelete);
    if (compErr) {
      console.error("Error deleting complaints:", compErr.message);
    } else {
      console.log("Successfully deleted all complaints.");
    }
  }

  // 4. Delete all job cases, job documents, and download runs
  console.log("Clearing all job case and download tables...");
  const jobTables = [
    "job_documents",
    "job_cases",
    "job_download_runs"
  ];
  for (const table of jobTables) {
    const { error } = await supabase
      .from(table)
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) console.error(`Error clearing ${table}:`, error.message);
    else console.log(`Cleared all records from ${table}.`);
  }

  // 5. Clear import batches & background jobs to prevent automated re-triggers
  const { error: batchErr } = await supabase
    .from("forensic_import_batches")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (batchErr) console.error("Error clearing forensic_import_batches:", batchErr.message);
  else console.log("Cleared forensic_import_batches.");

  const { error: bgErr } = await supabase
    .from("background_jobs")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (bgErr) console.error("Error clearing background_jobs:", bgErr.message);
  else console.log("Cleared background_jobs.");

  console.log("Database complaints tables are now completely empty!");
}

run().catch((err) => {
  console.error("Fatal error:", err);
});
