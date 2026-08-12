import "server-only";
const fs = typeof window === "undefined" ? eval('require("fs")') : null;
const path = typeof window === "undefined" ? eval('require("path")') : null;
const pg = typeof window === "undefined" ? eval('require("pg")') : null;
import type { StartupTask } from "./types";
import { StartupLogger } from "./logger";
import { requireStartupDbSettings } from "./db-config";

export class DatabaseMigrationTask implements StartupTask {
  name = "Database Migrations";
  critical = true;

  /**
   * Auto-migrating on every boot is safe for local/dev convenience but is a
   * real production risk: a bad migration file or a mid-incident restart
   * would otherwise silently alter schema or crash-loop the app (this task
   * is `critical`, so a failure here calls process.exit(1)). RUN_MIGRATIONS_ON_BOOT
   * is an explicit override in either direction; absent it, default to
   * "skip in production, run everywhere else" so nothing changes for dev/test.
   */
  static shouldRunAutoMigrations(): boolean {
    const override = process.env.RUN_MIGRATIONS_ON_BOOT;
    if (override === "true") return true;
    if (override === "false") return false;
    return process.env.NODE_ENV !== "production";
  }

  async run(): Promise<void> {
    if (!DatabaseMigrationTask.shouldRunAutoMigrations()) {
      StartupLogger.info(
        `Skipping automatic migrations (NODE_ENV=${process.env.NODE_ENV ?? "unset"}). Run "npm run db:migrate" manually, or set RUN_MIGRATIONS_ON_BOOT=true to opt back in.`,
      );
      return;
    }

    if (!pg || !fs || !path) {
      throw new Error("Required Node native modules (pg, fs, path) are not available.");
    }
    // Accepts DB_* or DATABASE_URL — see lib/startup/db-config.ts.
    const client = new pg.Client(requireStartupDbSettings());

    await client.connect();

    try {
      // 1. Check if the schema_migrations table exists
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'schema_migrations'
        );
      `);
      
      const tableExists = tableCheck.rows[0].exists;

      // Scan local migrations directory
      const migrationsDir = path.join(process.cwd(), "db", "migrations");
      const files = fs.readdirSync(migrationsDir)
        .filter((f: string) => f.endsWith(".sql"))
        .sort();

      if (files.length === 0) {
        StartupLogger.info("No migrations found in db/migrations");
        return;
      }

      if (!tableExists) {
        StartupLogger.info("Creating schema_migrations history tracking table...");
        await client.query(`
          CREATE TABLE public.schema_migrations (
            version varchar(255) PRIMARY KEY,
            applied_at timestamptz DEFAULT now()
          );
        `);

        // Check if database was already initialized before we introduced tracking
        const profilesCheck = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'profiles'
          );
        `);
        const databaseAlreadyExists = profilesCheck.rows[0].exists;

        if (databaseAlreadyExists) {
          StartupLogger.info("Existing database detected. Bootstrapping migration history without re-running old migrations.");
          for (const file of files) {
            await client.query(
              "INSERT INTO public.schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING;",
              [file]
            );
          }
          StartupLogger.info(`Marked all ${files.length} existing migration(s) as applied.`);
          return;
        }
      }

      // 2. Fetch applied migrations
      const appliedCheck = (await client.query(
        "SELECT version FROM public.schema_migrations;"
      )) as { rows: { version: string }[] };
      const appliedVersions = new Set(appliedCheck.rows.map((row: { version: string }) => row.version));

      // 3. Find pending migrations
      const pendingFiles = files.filter((f: string) => !appliedVersions.has(f));

      if (pendingFiles.length === 0) {
        StartupLogger.info("Database is up-to-date. No pending migrations.");
        return;
      }

      StartupLogger.info(`Found ${pendingFiles.length} pending migration(s). Applying...`);

      for (const file of pendingFiles) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
        const t0 = Date.now();
        
        await client.query("BEGIN;");
        try {
          await client.query(sql);
          await client.query(
            "INSERT INTO public.schema_migrations (version) VALUES ($1);",
            [file]
          );
          await client.query("COMMIT;");
          StartupLogger.info(`  • Applied ${file} in ${Date.now() - t0}ms`);
        } catch (err) {
          await client.query("ROLLBACK;");
          throw new Error(`Migration ${file} failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      StartupLogger.info("All pending migrations applied successfully.");
    } finally {
      await client.end().catch(() => {});
    }
  }
}
