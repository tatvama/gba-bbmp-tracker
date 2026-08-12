import "server-only";

/**
 * One place that answers "how do I reach the database", for the startup tasks.
 *
 * These tasks cannot import lib/db/pool — it pulls in `pg`, and anything
 * statically reachable from instrumentation.ts must not (see the comment at the
 * top of lib/db/pool.ts). This module deliberately has no `pg` dependency at
 * all, so all of them can share it: migrations, seeding, connectivity and the
 * health check previously each rolled their own, and three of the four insisted
 * on DATABASE_URL specifically — which is why deployments had to set the same
 * credentials twice, once as DB_* and once as a URL.
 *
 * Either form works now, and DB_* is the one to prefer: no percent-encoding of
 * reserved characters in the password, and one copy to keep correct.
 */

export interface StartupDbSettings {
  connectionString: string;
  ssl: false | { rejectUnauthorized: boolean };
}

/** Returns null when nothing is configured, so callers can skip or throw as suits them. */
export function resolveStartupDbSettings(): StartupDbSettings | null {
  const { DATABASE_URL, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

  let connectionString = DATABASE_URL?.trim() ?? "";

  if (!connectionString) {
    if (!(DB_HOST && DB_USER && DB_PASSWORD && DB_NAME)) return null;
    // encodeURIComponent so a password containing @ : / ? # still parses.
    const auth = `${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD)}`;
    connectionString = `postgresql://${auth}@${DB_HOST}:${DB_PORT ?? 5432}/${DB_NAME}`;
  }

  return {
    connectionString,
    // TLS is opt-in: requesting it from a server that does not offer it fails
    // every connection outright, and the current server does not offer it.
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
  };
}

/** Same, but throws with a message naming what is missing. */
export function requireStartupDbSettings(): StartupDbSettings {
  const settings = resolveStartupDbSettings();
  if (!settings) {
    const missing = Object.entries({
      DB_HOST: process.env.DB_HOST,
      DB_USER: process.env.DB_USER,
      DB_PASSWORD: process.env.DB_PASSWORD,
      DB_NAME: process.env.DB_NAME,
    })
      .filter(([, v]) => !v)
      .map(([k]) => k);
    throw new Error(
      `Database is not configured — missing ${missing.join(", ")}. ` +
        "Set DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME, or a single DATABASE_URL.",
    );
  }
  return settings;
}
