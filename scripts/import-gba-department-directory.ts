/**
 * Import the department/zone/oversight officer directory (data/gba-department-
 * directory.json, HIGH confidence, official-source-cited) plus the user-supplied
 * addendum (data/bbmp-officer-directory-addendum.json, MEDIUM confidence) into
 * the Contact directory.
 *
 * ALL reconciliation logic (what enriches an existing row vs. what is a fresh
 * insert vs. what needs a human) lives in the pure
 * lib/contacts/gba-department-directory.ts — this script only executes that
 * plan: resolves corporation codes to ids and existing-contact ids, then
 * writes (or, without --commit, just prints what it would do).
 *
 * The user was explicit that this must never create a duplicate contact for an
 * official already in the system — that is why the dry-run below reports
 * INSERT / UPDATE / NEEDS REVIEW as three separate counts, not one. Confirm the
 * split matches expectations before ever passing --commit.
 *
 *   npx tsx --tsconfig scripts/tsconfig.pipeline.json scripts/import-gba-department-directory.ts            # dry run (no writes)
 *   npx tsx --tsconfig scripts/tsconfig.pipeline.json scripts/import-gba-department-directory.ts --commit   # write to the DB
 */
import { loadEnv } from "./db";
import { buildDepartmentDirectoryPlan, type DeptContactRow } from "@/lib/contacts/gba-department-directory";

loadEnv();

const COMMIT = process.argv.includes("--commit");

function describeRow(row: DeptContactRow): string {
  return `${row.full_name} — ${row.designation}${row.department ? ` (${row.department})` : ""}${row.email ? ` <${row.email}>` : " (no email)"}`;
}

async function main() {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  const plan = buildDepartmentDirectoryPlan();

  console.log(`GBA department directory: ${plan.inserts.length} to insert, ${plan.updates.length} to update, ${plan.deactivations.length} to deactivate, ${plan.needsReview.length} needing manual review.`);
  console.log(COMMIT ? "MODE: COMMIT (writing to the database)\n" : "MODE: DRY RUN (no writes — pass --commit to apply)\n");

  // ── needs-review — printed first and unconditionally, dry-run or not,
  //    since these are NEVER acted on by this script either way. ────────────
  if (plan.needsReview.length) {
    console.log("──────── NEEDS MANUAL REVIEW (not written by this script) ────────");
    for (const r of plan.needsReview) {
      console.log(`  ? ${r.email} — ${r.description}`);
      console.log(`    ${r.detail}`);
    }
    console.log();
  }

  // ── resolve corporation codes -> ids once, for both inserts and (if ever
  //    needed) updates. ──────────────────────────────────────────────────
  const { data: corpRows } = await admin.from("corporations").select("id, code");
  const corpIdByCode = new Map<string, string>((corpRows as { id: string; code: string }[] | null ?? []).map((c) => [c.code, c.id]));

  let inserted = 0, insertFailed = 0;
  let updated = 0, updateMissing = 0, updateFailed = 0;
  let deactivated = 0, deactivateMissing = 0, deactivateFailed = 0;

  console.log(`──────── INSERTS (${plan.inserts.length}) ────────`);
  for (const row of plan.inserts) {
    const corporationId = row.corporation_code ? corpIdByCode.get(row.corporation_code) ?? null : null;
    if (row.corporation_code && !corporationId) {
      console.warn(`  ! unknown corporation code "${row.corporation_code}" for ${row.full_name} — inserting with corporation_id null`);
    }
    const { corporation_code: _corporationCode, ...rest } = row;
    void _corporationCode;
    const dbRow = { ...rest, corporation_id: corporationId };

    if (!COMMIT) {
      console.log(`  [dry] + ${describeRow(row)}`);
      continue;
    }
    const { error } = await admin.from("contacts").insert(dbRow);
    if (error) {
      console.error(`  x insert failed ${row.full_name}:`, error.message);
      insertFailed++;
      continue;
    }
    inserted++;
    console.log(`  + ${describeRow(row)}`);
  }

  console.log(`\n──────── UPDATES (${plan.updates.length}) ────────`);
  for (const u of plan.updates) {
    const query =
      "source" in u.matchBy
        ? admin.from("contacts").select("id, full_name").eq("source", u.matchBy.source).eq("designation", u.matchBy.designation).limit(1)
        : admin.from("contacts").select("id, full_name").eq("email", u.matchBy.email).limit(1);
    const { data: existing } = await query;
    const target = (existing as { id: string; full_name: string }[] | null)?.[0];

    const matchDesc = "source" in u.matchBy ? `designation="${u.matchBy.designation}"` : `email="${u.matchBy.email}"`;

    if (!target) {
      if ("source" in u.matchBy) {
        // These 6 posts are supposed to already exist from a SEPARATE import
        // (scripts/import-gba-authorities.ts) — this script only enriches them,
        // it never creates them, so there is nothing this script can fall back
        // to here. Flag it plainly rather than silently skipping.
        console.warn(`  ! MISSING PREREQUISITE: no contact with ${matchDesc} exists yet.`);
        console.warn(`    Run "npx tsx --tsconfig scripts/tsconfig.pipeline.json scripts/import-gba-authorities.ts --commit" first, then re-run this script.`);
      } else if (!COMMIT) {
        // Expected in dry-run: the official row this would attach to is one of
        // THIS run's own pending inserts (printed above), so it doesn't exist
        // yet to be found. Resolves on its own once --commit runs the inserts
        // before the updates in the same pass.
        console.log(`  [dry] ~ (pending) will attach to ${matchDesc} once it is inserted by this same run's --commit`);
      } else {
        // Should not happen on commit — inserts ran before updates in this same
        // pass, so the official row should already be there.
        console.warn(`  ! unexpectedly still no contact with ${matchDesc} after this run's own inserts committed.`);
      }
      updateMissing++;
      continue;
    }

    if (!COMMIT) {
      console.log(`  [dry] ~ ${target.full_name} (${matchDesc}) <- ${JSON.stringify(u.patch)}`);
      continue;
    }
    const { error } = await admin.from("contacts").update(u.patch).eq("id", target.id);
    if (error) {
      console.error(`  x update failed ${target.full_name}:`, error.message);
      updateFailed++;
      continue;
    }
    updated++;
    console.log(`  ~ ${target.full_name} (${matchDesc})`);
  }

  console.log(`\n──────── DEACTIVATIONS (${plan.deactivations.length}) ────────`);
  for (const d of plan.deactivations) {
    const { data: existing } = await admin
      .from("contacts")
      .select("id, full_name")
      .eq("source", d.matchBy.source)
      .eq("designation", d.matchBy.designation)
      .limit(1);
    const target = (existing as { id: string; full_name: string }[] | null)?.[0];

    if (!target) {
      // Harmless, unlike the same situation for an update: if the defunct
      // contact was never created, there is nothing wrongly "live" to retire —
      // the deactivation's goal (this designation must not be a live recipient)
      // already holds by absence.
      console.log(`  (nothing to deactivate — no contact with designation="${d.matchBy.designation}" exists)`);
      deactivateMissing++;
      continue;
    }

    if (!COMMIT) {
      console.log(`  [dry] ~ ${target.full_name} -> officer_status = "Inactive" (${d.reason})`);
      continue;
    }
    const { error } = await admin.from("contacts").update({ officer_status: "Inactive" }).eq("id", target.id);
    if (error) {
      console.error(`  x deactivate failed ${target.full_name}:`, error.message);
      deactivateFailed++;
      continue;
    }
    deactivated++;
    console.log(`  ~ ${target.full_name} -> Inactive`);
  }

  console.log("\n──────── SUMMARY ────────");
  console.log(`Inserts:       ${COMMIT ? `${inserted} created` : `${plan.inserts.length} planned`}${insertFailed ? `, ${insertFailed} FAILED` : ""}`);
  console.log(`Updates:       ${COMMIT ? `${updated} applied` : `${plan.updates.length} planned`}${updateMissing ? `, ${updateMissing} had no match` : ""}${updateFailed ? `, ${updateFailed} FAILED` : ""}`);
  console.log(`Deactivations: ${COMMIT ? `${deactivated} applied` : `${plan.deactivations.length} planned`}${deactivateMissing ? `, ${deactivateMissing} had no match` : ""}${deactivateFailed ? `, ${deactivateFailed} FAILED` : ""}`);
  console.log(`Needs review:  ${plan.needsReview.length} (never written by this script)`);
  if (!COMMIT) console.log("\nDry run only — re-run with --commit to write.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
