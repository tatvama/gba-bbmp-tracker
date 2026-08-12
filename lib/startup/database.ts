import "server-only";
/**
 * `pg` is pulled in through eval'd require, not an import — the same workaround
 * lib/startup/migrations.ts uses, and for the same reason.
 *
 * instrumentation.ts imports this module (via lib/startup), and Next.js bundles
 * instrumentation.ts for BOTH the Node and Edge runtimes. `pg` reaches
 * node:fs/node:net through pgpass, which cannot resolve in the Edge bundle, so a
 * static `import` of anything that touches `pg` fails the whole build — even
 * though `register()` returns early unless NEXT_RUNTIME is "nodejs", and even
 * through a dynamic `await import()`, because webpack still traces those. Hiding
 * the require from static analysis is what keeps the build working. Every other
 * (request-served) module imports lib/db normally.
 */
const pg = typeof window === "undefined" ? eval('require("pg")') : null;
import type { StartupTask } from "./types";
import { requireStartupDbSettings } from "./db-config";

/**
 * Startup checks for the application's own Postgres server.
 *
 * Replaces the pair of Supabase tasks that used to live here: one confirmed a
 * service-role client could be constructed, the other opened a throwaway client
 * against DATABASE_URL. Both are the same question now — can the server reach
 * the database — so the first validates configuration and the second queries.
 */

export class DatabaseConfigurationTask implements StartupTask {
  name = "Database Configuration";
  critical = true;

  async run(): Promise<void> {
    // Throws with a message naming whichever variable is missing.
    requireStartupDbSettings();
  }
}

export class DatabaseConnectivityTask implements StartupTask {
  name = "Database Connectivity Verification";
  critical = true;

  async run(): Promise<void> {
    if (!pg) throw new Error("pg module is not available.");

    const client = new pg.Client(requireStartupDbSettings());
    try {
      await client.connect();
      const res = await client.query("select 1 as ping;");
      if (res.rows[0]?.ping !== 1) {
        throw new Error("Unexpected database ping result.");
      }
    } catch (err) {
      throw new Error(
        `Failed to connect to database: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      await client.end().catch(() => {});
    }
  }
}
