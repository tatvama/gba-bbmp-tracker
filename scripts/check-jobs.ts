import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  const { data: bgJobs, error: errBg } = await supabase.from("background_jobs").select("*");
  const { data: batches, error: errBatches } = await supabase.from("forensic_import_batches").select("*");
  const { data: runs, error: errRuns } = await supabase.from("job_download_runs").select("*");

  console.log("Background Jobs:", bgJobs);
  console.log("Forensic Import Batches:", batches);
  console.log("Job Download Runs:", runs);
}

run();
