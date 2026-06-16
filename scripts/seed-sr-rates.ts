/**
 * Seed a sample Schedule of Rates (SR) into sr_rates for the bill rate-check.
 * Idempotent: removes prior SAMPLE rows then re-inserts. Replace data/sr_rates_sample.json
 * (or load your real KPWD/BBMP SR) and re-run.
 *
 *   npm run db:seed-sr
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnv } from "./db";

loadEnv();

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("\n✗ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.\n");
    process.exit(1);
  }
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const rows = JSON.parse(readFileSync(join(process.cwd(), "data", "sr_rates_sample.json"), "utf8")) as Record<string, unknown>[];

  await admin.from("sr_rates").delete().eq("source", "SAMPLE");
  const { error } = await admin.from("sr_rates").insert(rows.map((r) => ({ ...r, source: "SAMPLE" })));
  if (error) {
    console.error("✗ seed failed:", error.message);
    process.exit(1);
  }
  console.log(`✓ Seeded ${rows.length} sample SR rates (source=SAMPLE). Replace with your real SR for production.`);
}

main();
