/**
 * CLI removal of wrongly-imported job cases (e.g. a phantom job created from a
 * mistyped job code in a scanned file's name, before grouping learned to fold
 * those typos into the real job).
 *
 *   npm run job:delete -- <job-code> [more codes ...] [--dry-run]
 *
 * Per code, this:
 *   1. deletes the job_cases row (job_documents rows cascade with it),
 *   2. soft-deletes the linked complaint (same deleted_at mechanism as the
 *      in-app delete — history stays recoverable in the DB),
 *   3. leaves R2 objects in place (harmless orphans; complaint documents stay
 *      readable if the complaint is ever undeleted by hand).
 *
 * Requires .env with SUPABASE credentials (same as the app).
 */
import { loadEnv } from "./db";

loadEnv();

async function main() {
  // Dynamic import AFTER loadEnv so lib modules see the env vars.
  const { createAdminClient } = await import("@/lib/db");

  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const codes = args.filter((a) => !a.startsWith("--"));

  if (!codes.length) {
    console.error("Usage: npm run job:delete -- <job-code> [more codes ...] [--dry-run]");
    process.exit(1);
  }

  const admin = createAdminClient();
  let failed = false;

  for (const code of codes) {
    console.log(`\n══ ${code} ══`);
    const { data: jc } = await admin
      .from("job_cases")
      .select("id, job_number, description, complaint_id, file_count, created_at")
      .eq("job_number", code)
      .maybeSingle();
    if (!jc) {
      console.log("  · no job case with this job number — nothing to do.");
      continue;
    }
    console.log(`  · job case ${jc.id} (${jc.file_count} files, created ${jc.created_at})`);

    let complaint: { id: string; internal_case_number: string | null; deleted_at: string | null } | null = null;
    if (jc.complaint_id) {
      const { data } = await admin
        .from("complaints")
        .select("id, internal_case_number, deleted_at")
        .eq("id", jc.complaint_id)
        .maybeSingle();
      complaint = data ?? null;
      if (complaint) {
        console.log(
          `  · linked complaint ${complaint.internal_case_number ?? complaint.id}${complaint.deleted_at ? " (already deleted)" : ""}`,
        );
      }
    }

    if (dryRun) {
      console.log("  · dry run — nothing deleted.");
      continue;
    }

    if (complaint && !complaint.deleted_at) {
      const { error } = await admin
        .from("complaints")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", complaint.id);
      if (error) {
        console.error(`  ✗ could not soft-delete complaint: ${error.message}`);
        failed = true;
        continue; // keep the job case so the pair stays consistent
      }
      console.log("  ✓ complaint soft-deleted");
    }

    const { error } = await admin.from("job_cases").delete().eq("id", jc.id);
    if (error) {
      console.error(`  ✗ could not delete job case: ${error.message}`);
      failed = true;
      continue;
    }
    console.log("  ✓ job case deleted (its job_documents rows cascaded)");
  }

  console.log("");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
