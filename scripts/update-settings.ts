import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  console.log("Fetching current RTI deadline rules...");
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "rti_deadline_rules")
    .single();

  if (error || !data) {
    console.error("Error fetching rules:", error);
    return;
  }

  const currentRules = data.value as any;
  console.log("Current rules in DB:", currentRules);

  const updatedRules = {
    ...currentRules,
    secondAppealDays: 15,
  };

  console.log("Updating secondAppealDays to 15...");
  const { error: updateError } = await supabase
    .from("app_settings")
    .update({ value: updatedRules })
    .eq("key", "rti_deadline_rules");

  if (updateError) {
    console.error("Error updating rules:", updateError);
  } else {
    console.log("Successfully updated RTI deadline rules in DB:", updatedRules);
  }
}

run();
