import { createDbClient } from "../lib/db";
import * as dotenv from "dotenv";

dotenv.config();
const db = createDbClient();

async function run() {
  console.log("Fetching current RTI deadline rules...");
  const { data, error } = await db
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
  const { error: updateError } = await db
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
