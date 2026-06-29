import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  console.log("Starting full deletion of all RTI-related data...");

  // 1. Delete Second Appeals
  console.log("Deleting rti_second_appeals...");
  const { error: errSec } = await supabase
    .from("rti_second_appeals")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (errSec) console.error("Error deleting second appeals:", errSec);
  else console.log("Successfully deleted rti_second_appeals.");

  // 2. Delete First Appeals
  console.log("Deleting rti_first_appeals...");
  const { error: errFirst } = await supabase
    .from("rti_first_appeals")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (errFirst) console.error("Error deleting first appeals:", errFirst);
  else console.log("Successfully deleted rti_first_appeals.");

  // 3. Delete RTI Documents
  console.log("Deleting rti_documents...");
  const { error: errDocs } = await supabase
    .from("rti_documents")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (errDocs) console.error("Error deleting rti documents:", errDocs);
  else console.log("Successfully deleted rti_documents.");

  // 4. Delete RTI Applications
  console.log("Deleting rti_applications...");
  const { error: errApps } = await supabase
    .from("rti_applications")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (errApps) console.error("Error deleting rti applications:", errApps);
  else console.log("Successfully deleted rti_applications.");

  // 5. Delete Reminders
  console.log("Deleting rti reminders...");
  const { error: errRem } = await supabase
    .from("reminders")
    .delete()
    .eq("entity_type", "rti");
  if (errRem) console.error("Error deleting reminders:", errRem);
  else console.log("Successfully deleted rti reminders.");

  // 6. Delete Audit Logs
  console.log("Deleting rti audit logs...");
  const { error: errAud } = await supabase
    .from("audit_logs")
    .delete()
    .eq("entity_type", "rti");
  if (errAud) console.error("Error deleting audit logs:", errAud);
  else console.log("Successfully deleted rti audit logs.");

  // 7. Delete all files in the 'rti' storage bucket
  console.log("Listing and deleting files from 'rti' storage bucket...");
  const { data: files, error: errList } = await supabase.storage
    .from("rti")
    .list("", { limit: 100 });

  if (errList) {
    console.error("Error listing files in rti bucket:", errList);
  } else if (files && files.length > 0) {
    console.log(`Found ${files.length} files/folders in 'rti' bucket. Deleting...`);
    for (const f of files) {
      if (f.name === ".emptyKeep") continue;
      
      // Since files are stored in folders by rti_id (e.g. rti_id/filename.pdf),
      // we list the contents of the folder and remove them first.
      const { data: subFiles, error: errSubList } = await supabase.storage
        .from("rti")
        .list(f.name);
      
      if (subFiles && subFiles.length > 0) {
        const paths = subFiles.map(sf => `${f.name}/${sf.name}`);
        console.log(`Deleting ${paths.length} sub-files inside folder ${f.name}...`);
        const { error: errSubDel } = await supabase.storage
          .from("rti")
          .remove(paths);
        if (errSubDel) console.error(`Error deleting sub-files in ${f.name}:`, errSubDel);
      }
      
      const { error: errDel } = await supabase.storage
        .from("rti")
        .remove([f.name]);
      if (errDel) console.error(`Error deleting folder/file ${f.name}:`, errDel);
    }
    console.log("Completed storage cleanup.");
  } else {
    console.log("No files found in 'rti' storage bucket.");
  }

  console.log("All RTI-related data has been successfully deleted!");
}

run();
