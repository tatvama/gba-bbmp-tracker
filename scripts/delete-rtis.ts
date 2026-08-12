import { createDbClient } from "../lib/db";
import * as dotenv from "dotenv";

dotenv.config();
const db = createDbClient();

async function run() {
  console.log("Deleting all RTI applications...");
  const { error: errorRtis } = await db
    .from("rti_applications")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (errorRtis) {
    console.error("Error deleting RTI applications:", errorRtis);
  } else {
    console.log("Successfully deleted all rows from the rti_applications table!");
  }

  console.log("Deleting all RTI reminders / follow-ups...");
  const { error: errorReminders } = await db
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
