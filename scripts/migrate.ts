/**
 * Applies every SQL file in supabase/migrations (in filename order) to the
 * Supabase Postgres database identified by DATABASE_URL.
 *
 *   npm run db:migrate
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { loadEnv, makeClient, requireDatabaseUrl } from "./db";

loadEnv();

async function main() {
  const url = requireDatabaseUrl();
  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = join(here, "..", "supabase", "migrations");

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.error("✗ No .sql migrations found in", migrationsDir);
    process.exit(1);
  }

  const client = makeClient(url);
  await client.connect();
  console.log("→ Connected. Applying", files.length, "migration(s)…");

  try {
    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), "utf-8");
      process.stdout.write(`  • ${file} … `);
      await client.query(sql);
      console.log("done");
    }
    console.log("\n✓ Migrations applied successfully.");
  } catch (err) {
    console.error("\n✗ Migration failed:\n", err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
