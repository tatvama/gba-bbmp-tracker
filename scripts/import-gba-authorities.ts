/**
 * Add the GBA senior-authority recipients (Chief Commissioner GBA, Minister
 * in-charge, Chief Minister, UDD Principal Secretary, Lokayukta, ACB) into the
 * Contact directory. These are cross-cutting recipients — no ward / sub-division
 * jurisdiction — so no contact_jurisdictions rows are written.
 *
 * Idempotent: dedupes on (full_name + source), so re-running updates the same
 * rows in place. Requires migration 0044_contact_directory.sql applied first.
 *
 *   npx tsx --tsconfig scripts/tsconfig.pipeline.json scripts/import-gba-authorities.ts            # dry run (no writes)
 *   npx tsx --tsconfig scripts/tsconfig.pipeline.json scripts/import-gba-authorities.ts --commit   # write to the DB
 */
import { loadEnv } from "./db";
import {
  GBA_AUTHORITIES,
  GBA_AUTHORITY_SOURCE,
  authorityToContactRow,
} from "@/lib/contacts/gba-authorities";

loadEnv();

const COMMIT = process.argv.includes("--commit");

async function main() {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  console.log(`GBA authorities: ${GBA_AUTHORITIES.length} recipients.`);
  console.log(COMMIT ? "MODE: COMMIT (writing to the database)\n" : "MODE: DRY RUN (no writes — pass --commit to apply)\n");

  let created = 0, updated = 0;

  for (const a of GBA_AUTHORITIES) {
    const row = authorityToContactRow(a);

    if (!COMMIT) {
      console.log(`  [dry] ${row.official_title ? row.official_title + " " : ""}${row.full_name} — ${row.designation} (${row.department})`);
      continue;
    }

    // Dedupe on (full_name + source): update our own prior row, never clobber a
    // manually-created contact that happens to share a name.
    const { data: existing } = await admin
      .from("contacts")
      .select("id")
      .eq("full_name", row.full_name)
      .eq("source", GBA_AUTHORITY_SOURCE)
      .limit(1);

    if (existing && existing.length) {
      const { error } = await admin.from("contacts").update(row).eq("id", existing[0]!.id);
      if (error) { console.error(`  x update failed ${row.full_name}:`, error.message); continue; }
      updated++;
      console.log(`  ~ updated ${row.full_name} (${row.designation})`);
    } else {
      const { error } = await admin.from("contacts").insert(row);
      if (error) { console.error(`  x insert failed ${row.full_name}:`, error.message); continue; }
      created++;
      console.log(`  + created ${row.full_name} (${row.designation})`);
    }
  }

  console.log("\n──────── SUMMARY ────────");
  console.log(`Recipients processed: ${GBA_AUTHORITIES.length}`);
  console.log(`Contacts created:     ${created}`);
  console.log(`Contacts updated:     ${updated}`);
  if (!COMMIT) console.log("\nDry run only — re-run with --commit to write.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
