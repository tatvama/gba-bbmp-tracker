import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not defined in env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function deleteTableData(tableName: string) {
  console.log(`Deleting all records from table: ${tableName}...`);
  const { error } = await supabase
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

async function run() {
  console.log("Starting full deletion of complaints and RTI data...");

  // Order of deletion (child tables first, parent tables last)
  const tables = [
    // Complaint child tables
    "complaint_action_taken",
    "complaint_replies",
    "complaint_timeline",
    "complaint_documents",
    
    // RTI child tables
    "hearings",
    "reminders",
    "follow_up_actions",
    "communication_logs",
    "escalation_logs",
    "attachments",
    "ai_drafts",
    "rti_documents",
    "rti_first_appeals",
    "rti_second_appeals",
    "rti_import_batches",
    
    // Parent tables
    "complaints",
    "rti_applications"
  ];

  for (const table of tables) {
    await deleteTableData(table);
  }

  console.log("Finished deleting all complaints and RTI data.");
}

run().catch((err) => {
  console.error("Fatal error during deletion:", err);
});
