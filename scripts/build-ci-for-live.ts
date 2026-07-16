/**
 * Build the Case Intelligence artifact for given complaints (or all live ones if
 * none given) and report what the artifact actually contains. Unblocks existing
 * complaints whose dossier was never built, and proves the pipeline on real data.
 *
 *   npx tsx --tsconfig scripts/tsconfig.pipeline.json scripts/build-ci-for-live.ts [complaintId ...]
 */
import { loadEnv } from "./db";

loadEnv();

async function main() {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { buildCaseIntelligence } = await import("@/lib/intelligence/engine");
  const admin = createAdminClient();

  let ids = process.argv.slice(2);
  if (!ids.length) {
    const { data } = await admin.from("complaints").select("id").is("deleted_at", null).order("created_at", { ascending: false }).limit(50);
    ids = (data ?? []).map((c) => c.id as string);
  }
  console.log(`Building Case Intelligence for ${ids.length} complaint(s)…\n`);

  for (const id of ids) {
    const t0 = Date.now();
    const res = await buildCaseIntelligence(admin, id, { force: true });
    const ms = Date.now() - t0;
    if (!res.ok || !res.intel) { console.log(`  ${id}: FAILED — ${res.error} (${ms}ms)`); continue; }
    const a = res.intel;
    console.log(`  ${id}: ok (${ms}ms, fromCache=${res.fromCache})`);
    console.log(`    references=${a.references.length} findings=${a.findings.length} correlations=${a.correlations.length} legalFramework=${a.legalFramework.length} compliance=${a.compliance.length}`);
    const refLabels = [...new Set(a.references.map((r) => r.label))];
    if (refLabels.length) console.log(`    reference labels: ${refLabels.join(", ")}`);
    if (a.references.length) for (const r of a.references.slice(0, 12)) console.log(`      • ${r.label}: ${r.value}`);
  }
  console.log("");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
