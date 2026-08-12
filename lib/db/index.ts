import "server-only";
export { createDbClient, QueryBuilder, RpcBuilder } from "@/lib/db/query";
export type { DbClient, DbError, DbResult } from "@/lib/db/query";
export { sql, getPool } from "@/lib/db/pool";

import { createDbClient, type DbClient } from "@/lib/db/query";

/**
 * The database handle for server components, route handlers, server actions and
 * scripts.
 *
 * Async only because the ~19 call sites that used the old cookie-bound Supabase
 * client already `await` it; there is nothing to wait for now. Under Supabase
 * this client carried the user's auth cookie so RLS could see who was asking.
 * There is no RLS any more — see the note on createAdminClient below.
 */
export async function createClient(): Promise<DbClient> {
  return createDbClient();
}

/**
 * Formerly the service-role client that bypassed RLS. It returns exactly the
 * same handle as createClient() now, and both names are kept so the call sites
 * that distinguish them still read as intended.
 *
 * This is not a loss of enforcement. Of the 97 files that used a Supabase
 * client, 79 already used this service-role handle and so were never subject to
 * RLS; and of the 197 policies that existed, not one filtered rows by owner on
 * a read — they gated writes by role (can_write/is_admin/can_verify), which
 * requireRole() in lib/auth.ts enforces in app code before any of these queries
 * run. Nothing in the browser has ever held a database credential.
 */
export function createAdminClient(): DbClient {
  return createDbClient();
}
