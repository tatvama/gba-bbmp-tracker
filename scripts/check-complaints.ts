import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  const { data, error } = await supabase
    .from("complaints")
    .select("id, status, title, internal_case_number");

  if (error) {
    console.error("Error fetching complaints:", error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log("No complaints found in the database. (The table is empty)");
    return;
  }

  console.log(`Total complaints: ${data.length}\n`);
  
  // Count by status
  const counts: Record<string, number> = {};
  data.forEach((c) => {
    counts[c.status] = (counts[c.status] || 0) + 1;
  });

  console.log("Status Breakdown:");
  for (const [status, count] of Object.entries(counts)) {
    console.log(`- ${status}: ${count}`);
  }

  console.log("\nRecent Cases:");
  data.slice(0, 5).forEach((c) => {
    console.log(`- ID: ${c.id} | [${c.status}] ${c.internal_case_number || "No Case Number"}: ${c.title}`);
  });

  console.log("\nAttempting to delete the complaints...");
  const deleteResponse = await supabase
    .from("complaints")
    .delete()
    .in("id", data.map(c => c.id));
    
  console.log("Delete Response:", {
    status: deleteResponse.status,
    statusText: deleteResponse.statusText,
    error: deleteResponse.error
  });
}

run();
