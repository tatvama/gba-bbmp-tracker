/**
 * Import the BBMP ARO directory (data/aro-directory.json) into the Contact
 * directory as "one officer, many wards": one contacts row per ARO officer +
 * one contact_jurisdictions row per ward they cover. Idempotent (dedupes by
 * mobile). Requires migration 0044_contact_directory.sql applied first.
 *
 *   npx tsx --tsconfig scripts/tsconfig.pipeline.json scripts/import-aro-directory.ts            # dry run (no writes)
 *   npx tsx --tsconfig scripts/tsconfig.pipeline.json scripts/import-aro-directory.ts --commit   # write to the DB
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnv } from "./db";
import {
  aroOfficerToContactRow,
  aroOfficerToJurisdictions,
  officerDedupeKey,
  type AroOfficer,
} from "@/lib/contacts/aro-import";

loadEnv();

const COMMIT = process.argv.includes("--commit");

async function main() {
  const { createAdminClient } = await import("@/lib/db");
  const admin = createAdminClient();

  const file = join(process.cwd(), "data", "aro-directory.json");
  const doc = JSON.parse(readFileSync(file, "utf8")) as { officers: AroOfficer[] };
  const officers = doc.officers ?? [];
  console.log(`ARO directory: ${officers.length} officers, ${officers.reduce((n, o) => n + o.wards.length, 0)} ward mappings.`);
  console.log(COMMIT ? "MODE: COMMIT (writing to the database)\n" : "MODE: DRY RUN (no writes — pass --commit to apply)\n");

  // Resolve ward numbers → wards.id (BBMP-225) once.
  const { data: wards } = await admin.from("wards").select("id, new_no");
  const wardIdByNo = new Map<number, string>();
  for (const w of (wards as { id: string; new_no: number }[] | null) ?? []) wardIdByNo.set(w.new_no, w.id);
  console.log(`Loaded ${wardIdByNo.size} BBMP wards for id resolution.\n`);

  let created = 0, updated = 0, jurisdictions = 0, unmatchedWards = 0, skipped = 0;
  const unmatchedWardNos: number[] = [];

  for (const o of officers) {
    const key = officerDedupeKey(o);
    if (!key) { skipped++; console.warn(`  ! skipped (no mobile): ${o.officer}`); continue; }
    const row = aroOfficerToContactRow(o);
    const jurs = aroOfficerToJurisdictions(o).map((j) => ({
      ...j,
      ward_id: wardIdByNo.get(j.ward_no) ?? null,
    }));
    for (const j of jurs) if (!j.ward_id) { unmatchedWards++; unmatchedWardNos.push(j.ward_no); }

    if (!COMMIT) {
      const matched = jurs.filter((j) => j.ward_id).length;
      console.log(`  [dry] ${row.official_title ? row.official_title + " " : ""}${row.full_name} (${key}) → ${jurs.length} ward(s), ${matched} matched to wards table`);
      jurisdictions += jurs.length;
      continue;
    }

    // Dedupe by mobile: update the existing officer contact, else insert.
    const { data: existing } = await admin.from("contacts").select("id").eq("phone", key).limit(1);
    let contactId: string;
    if (existing && existing.length) {
      contactId = existing[0]!.id as string;
      const { error } = await admin.from("contacts").update(row).eq("id", contactId);
      if (error) { console.error(`  x update failed ${row.full_name}:`, error.message); continue; }
      updated++;
    } else {
      const { data: ins, error } = await admin.from("contacts").insert(row).select("id").single();
      if (error || !ins) { console.error(`  x insert failed ${row.full_name}:`, error?.message); continue; }
      contactId = ins.id as string;
      created++;
    }

    // Replace this contact's ward jurisdictions.
    await admin.from("contact_jurisdictions").delete().eq("contact_id", contactId);
    const { error: jErr } = await admin.from("contact_jurisdictions").insert(
      jurs.map((j) => ({ contact_id: contactId, ...j })),
    );
    if (jErr) console.error(`  x jurisdictions failed ${row.full_name}:`, jErr.message);
    else jurisdictions += jurs.length;
  }

  console.log("\n──────── SUMMARY ────────");
  console.log(`Officers processed:      ${officers.length}`);
  console.log(`Contacts created:        ${created}`);
  console.log(`Contacts updated:        ${updated}`);
  console.log(`Officers skipped:        ${skipped}`);
  console.log(`Ward mappings:           ${jurisdictions}`);
  console.log(`Wards not matched to id: ${unmatchedWards}${unmatchedWardNos.length ? ` (nos: ${[...new Set(unmatchedWardNos)].sort((a, b) => a - b).join(", ")})` : ""}`);
  if (!COMMIT) console.log("\nDry run only — re-run with --commit to write.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
