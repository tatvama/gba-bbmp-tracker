import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing config");
    return;
  }
  const supabase = createClient(url, serviceKey);
  const { data: cols, error: err } = await supabase.from("complaints").select("*").limit(1);
  if (err) {
    console.error("Error querying table:", err);
  } else {
    // Print fields and check types
    console.log("Complaints row keys:", Object.keys(cols[0] || {}));
    
    // Query column types using information_schema via RPC or raw query
    // Let's run a simple sql script or print values
    console.log("Sample row:", cols[0]);
  }
}
main();
