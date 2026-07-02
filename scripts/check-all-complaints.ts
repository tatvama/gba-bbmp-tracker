import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkTable(tableName: string) {
  const { count, error } = await supabase
    .from(tableName)
    .select("*", { count: "exact", head: true });

  if (error) {
    console.error(`Error checking ${tableName}:`, error.message);
  } else {
    console.log(`Table ${tableName}: ${count} rows`);
  }
}

async function run() {
  const tables = [
    "complaint_action_taken",
    "complaint_replies",
    "complaint_timeline",
    "complaint_documents",
    "complaints"
  ];

  for (const table of tables) {
    await checkTable(table);
  }
}

run();
