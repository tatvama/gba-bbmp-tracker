/**
 * Verify the Case Intelligence single-flight / coalesce behaviour without
 * running two real ~90s builds. Uses a complaint that already has a 'done'
 * artifact; temporarily flips build_status and checks the engine's decision,
 * then restores 'done'.
 *
 *   npx tsx --tsconfig scripts/tsconfig.pipeline.json scripts/verify-ci-singleflight.ts <complaintId>
 */
import { loadEnv } from "./db";

loadEnv();

async function main() {
  const { createAdminClient } = await import("@/lib/db");
  const { buildCaseIntelligence } = await import("@/lib/intelligence/engine");
  const admin = createAdminClient();

  const id = process.argv[2] || "3767531c-01cc-47f4-b8e8-992f2205639d";
  const { data: before } = await admin.from("case_intelligence").select("build_status, artifact, context_hash").eq("complaint_id", id).maybeSingle();
  if (!before?.artifact) { console.log(`Complaint ${id} has no artifact — run build-ci-for-live first.`); process.exit(1); }
  console.log(`Complaint ${id}: starting build_status=${before.build_status}, artifact present=yes\n`);

  const results: { name: string; pass: boolean; detail: string }[] = [];

  // 1) Fresh 'running' → a non-force build must COALESCE (fast, fromCache, no ~90s pipeline).
  await admin.from("case_intelligence").upsert({ complaint_id: id, build_status: "running" }, { onConflict: "complaint_id" });
  let t0 = Date.now();
  let r = await buildCaseIntelligence(admin, id);
  let ms = Date.now() - t0;
  results.push({
    name: "fresh 'running' coalesces (fast, fromCache)",
    pass: r.fromCache === true && ms < 15000,
    detail: `ok=${r.ok} fromCache=${r.fromCache} ${ms}ms (expected fromCache=true, <15s)`,
  });

  // 2) 'done' + matching hash → normal cache hit (fast).
  await admin.from("case_intelligence").upsert({ complaint_id: id, build_status: "done" }, { onConflict: "complaint_id" });
  t0 = Date.now();
  r = await buildCaseIntelligence(admin, id);
  ms = Date.now() - t0;
  results.push({
    name: "'done' + matching hash → cache hit (fast)",
    pass: r.ok === true && r.fromCache === true && ms < 15000,
    detail: `ok=${r.ok} fromCache=${r.fromCache} ${ms}ms (expected ok+fromCache, <15s)`,
  });

  // Restore to a clean 'done' state (it already is).
  const { data: after } = await admin.from("case_intelligence").select("build_status, artifact").eq("complaint_id", id).maybeSingle();
  results.push({
    name: "artifact preserved through the test",
    pass: !!after?.artifact && after.build_status === "done",
    detail: `build_status=${after?.build_status} artifact present=${!!after?.artifact}`,
  });

  console.log("Results:");
  let allPass = true;
  for (const c of results) { console.log(`  ${c.pass ? "PASS" : "FAIL"}  ${c.name} — ${c.detail}`); if (!c.pass) allPass = false; }
  console.log(`\n${allPass ? "ALL PASS" : "SOME FAILED"}\n`);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
