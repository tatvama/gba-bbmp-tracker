import { createAdminClient } from "../lib/supabase/admin";
import dotenv from "dotenv";

dotenv.config();

async function run() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("complaints")
    .select("id, title, type, status, location, description, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("Error fetching latest complaints:", error);
    return;
  }

  console.log("=== LATEST COMPLAINTS ===");
  console.log(JSON.stringify(data, null, 2));
}

run().catch(console.error);
