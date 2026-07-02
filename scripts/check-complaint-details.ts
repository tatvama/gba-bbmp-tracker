import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  const { data, error } = await supabase
    .from("complaints")
    .select("*");

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log("Complaints in DB:", JSON.stringify(data, null, 2));
}

run();
