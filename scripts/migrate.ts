/**
 * Applies every PENDING SQL file in db/migrations (in filename order) to
 * the Supabase Postgres database identified by DATABASE_URL, tracked in a
 * schema_migrations table (version = filename). Only files not yet recorded
 * there are applied, each in its own transaction. This is the SAME tracked
 * approach the app's own startup task uses (lib/startup/migrations.ts) — kept
 * as a separate plain implementation here (not a shared import) because that
 * file carries a deliberate eval('require(...)') workaround for being bundled
 * by instrumentation.ts, which this plain CLI script does not need or want.
 *
 * Never blindly re-runs an already-applied file: an early migration's CHECK
 * constraint can become stale once a LATER migration has moved real data past
 * it (e.g. 0004's original 18-value complaints.type constraint would reject
 * the department taxonomy 0039 already migrated data to) — blind full-replay
 * breaks the moment that happens, tracked-incremental never re-attempts it.
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
  const migrationsDir = join(here, "..", "db", "migrations");

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.error("✗ No .sql migrations found in", migrationsDir);
    process.exit(1);
  }

  const client = makeClient(url);
  await client.connect();
  console.log(`→ Connected. ${files.length} migration file(s) on disk.`);

  try {
    const tableCheck = await client.query(`
      select exists (
        select from information_schema.tables where table_schema = 'public' and table_name = 'schema_migrations'
      );
    `);
    const tableExists = tableCheck.rows[0].exists as boolean;

    if (!tableExists) {
      console.log("→ Creating schema_migrations history table…");
      await client.query(`
        create table public.schema_migrations (
          version varchar(255) primary key,
          applied_at timestamptz default now()
        );
      `);

      const profilesCheck = await client.query(`
        select exists (
          select from information_schema.tables where table_schema = 'public' and table_name = 'profiles'
        );
      `);
      if (profilesCheck.rows[0].exists as boolean) {
        console.log("→ Existing database detected — marking all current migrations as already applied (not re-running them).");
        for (const file of files) {
          await client.query(
            "insert into public.schema_migrations (version) values ($1) on conflict (version) do nothing;",
            [file],
          );
        }
        console.log(`✓ Marked all ${files.length} existing migration(s) as applied. Nothing to run.`);
        return;
      }
    }

    const appliedRes = await client.query("select version from public.schema_migrations;");
    const applied = new Set((appliedRes.rows as { version: string }[]).map((r) => r.version));
    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log("✓ Database is up-to-date. No pending migrations.");
      return;
    }

    console.log(`→ Applying ${pending.length} pending migration(s)…`);
    for (const file of pending) {
      const sql = readFileSync(join(migrationsDir, file), "utf-8");
      process.stdout.write(`  • ${file} … `);
      await client.query("BEGIN;");
      try {
        await client.query(sql);
        await client.query("insert into public.schema_migrations (version) values ($1);", [file]);
        await client.query("COMMIT;");
        console.log("done");
      } catch (err) {
        await client.query("ROLLBACK;");
        throw err;
      }
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
