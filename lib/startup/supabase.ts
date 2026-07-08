import "server-only";
const pg = typeof window === "undefined" ? eval('require("pg")') : null;
import { createAdminClient } from "@/lib/supabase/admin";
import type { StartupTask } from "./types";

export class SupabaseClientTask implements StartupTask {
  name = "Supabase Client Initialization";
  critical = true;

  async run(): Promise<void> {
    // Attempt client initialization
    const adminClient = createAdminClient();
    if (!adminClient) {
      throw new Error("Failed to initialize Supabase Admin client.");
    }
  }
}

export class DatabaseConnectivityTask implements StartupTask {
  name = "Database Connectivity Verification";
  critical = true;

  async run(): Promise<void> {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set.");
    }

    const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
    if (!pg) {
      throw new Error("pg module is not available.");
    }
    const client = new pg.Client({
      connectionString: url,
      ssl: isLocal ? false : { rejectUnauthorized: false },
    });

    try {
      await client.connect();
      const res = await client.query("SELECT 1 as ping;");
      if (res.rows[0]?.ping !== 1) {
        throw new Error("Unexpected database ping result.");
      }
    } catch (err) {
      throw new Error(`Failed to connect to database: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await client.end().catch(() => {});
    }
  }
}
