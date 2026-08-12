/**
 * Build the Case Intelligence artifact for one or more complaints and print the
 * two deterministic letter tables — the KW-4 Clause 13 INSURANCE table and the
 * SCHEDULE-B excavation / dismantling-milling tables — exactly as they will be
 * serialized into a counter-reply / legal-notice / Lokayukta draft. Fast local
 * verification against real data, without the dev server or a full letter draft.
 *
 *   npx tsx --tsconfig scripts/tsconfig.pipeline.json scripts/inspect-letter-tables.ts <complaintId> [complaintId ...]
 *
 * With no ids, inspects the 20 most recent works-case (job_number) complaints
 * and reports which ones produced each table.
 */
import { loadEnv } from "./db";

loadEnv();

async function main() {
  const { createAdminClient } = await import("@/lib/db");
  const { buildCaseIntelligence } = await import("@/lib/intelligence/engine");
  const admin = createAdminClient();

  let ids = process.argv.slice(2);
  if (!ids.length) {
    const { data } = await admin
      .from("complaints")
      .select("id, internal_case_number, job_number")
      .is("deleted_at", null)
      .not("job_number", "is", null)
      .order("created_at", { ascending: false })
      .limit(20);
    ids = (data ?? []).map((c) => c.id as string);
    console.log(`No ids given — inspecting ${ids.length} recent works-case complaint(s).\n`);
  }

  for (const id of ids) {
    const res = await buildCaseIntelligence(admin, id, { force: true });
    if (!res.ok || !res.intel) {
      console.log(`\n=== ${id}: FAILED — ${res.error} ===`);
      continue;
    }
    const a = res.intel;
    console.log(`\n=== ${id}  (job ${a.meta.jobNumber ?? "-"}) ===`);

    const ic = a.insuranceCoverage;
    if (ic && ic.rows.length) {
      console.log(`\n[INSURANCE — ${ic.ruleRef}]  policiesFound=${ic.policiesFound}`);
      console.log("  Type of Cover | Minimum Cover Required Under KW-4 | Status");
      for (const r of ic.rows) console.log(`  - ${r.coverType} | ${r.minimumRequired} | ${r.status}`);
    } else {
      console.log("\n[INSURANCE] (none — not a works case, or no agreement/policy found)");
    }

    const sb = a.scheduleBTables;
    if (sb && sb.groups.length) {
      for (const g of sb.groups) {
        console.log(`\n[SCHEDULE-B: ${g.title}]  (${g.rows.length} rows)`);
        console.log("  Item | Description | Qty | Unit | Rate | Amount");
        for (const r of g.rows) console.log(`  - ${r.item} | ${r.description} | ${r.qty} | ${r.unit} | ${r.rate} | ${r.amount}`);
        console.log(`  = ${g.totalLabel}: ${g.totalQty ?? ""} ${g.totalUnit ?? ""} | Rs. ${g.totalAmount}`);
      }
    } else {
      console.log("\n[SCHEDULE-B] (none — no earthwork/dismantling/milling line items found in any OCR'd document)");
    }
  }
  console.log("");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
