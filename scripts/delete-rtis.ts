import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  console.log("Deleting all RTI applications...");
  const { error: errorRtis } = await supabase
    .from("rti_applications")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (errorRtis) {
    console.error("Error deleting RTI applications:", errorRtis);
  } else {
    console.log("Successfully deleted all rows from the rti_applications table!");
  }

  console.log("Deleting all RTI reminders / follow-ups...");
  const { error: errorReminders } = await supabase
    .from("reminders")
    .delete()
    .eq("entity_type", "rti");

  if (errorReminders) {
    console.error("Error deleting RTI reminders:", errorReminders);
  } else {
    console.log("Successfully deleted all RTI reminders from the reminders table!");
  }
}

run();
