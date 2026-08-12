import "server-only";
// Types only — erased at compile time, so webpack never sees a "pg" specifier here.
import type { Pool } from "pg";

/**
 * `pg` is required through eval rather than imported, matching what
 * lib/startup/migrations.ts already had to do.
 *
 * instrumentation.ts is bundled for the Edge runtime as well as Node (this app
 * has middleware), and Next traces dynamic `await import()` calls too. `pg`
 * reaches node:fs/node:net via pgpass, which cannot resolve in an Edge bundle,
 * so any statically visible path from instrumentation.ts to `pg` fails the whole
 * production build — regardless of the `NEXT_RUNTIME !== "nodejs"` early return
 * in register(), and regardless of `serverExternalPackages`, which does not
 * apply to the Edge runtime. Doing it here rather than at each entry point means
 * every consumer (startup tasks, sweepers, schedulers, routes) is covered by one
 * workaround instead of needing its own.
 */
const pg = typeof window === "undefined" ? eval('require("pg")') : null;

function requirePg() {
  if (!pg) throw new Error("The pg module is not available in this runtime.");
  return pg as {
    Pool: new (config: Record<string, unknown>) => Pool;
    types: { setTypeParser: (oid: number, fn: (value: string) => unknown) => void };
  };
}

/**
 * The application's single Postgres connection pool.
 *
 * Replaces Supabase entirely: every read and write in this codebase now goes
 * through this pool over the `pg` driver. Nothing in the browser ever talks to
 * the database (there was no browser-side Supabase client either), so there is
 * no anon role and no RLS to satisfy — the server connects as one trusted role
 * and authorization is enforced in app code by requireRole() in lib/auth.ts.
 *
 * ---------------------------------------------------------------------------
 * Type parsers: these exist so query results keep the SHAPE the rest of this
 * codebase was written against.
 *
 * Supabase returned rows as JSON over PostgREST, so a timestamp arrived as an
 * ISO string, and int8/numeric arrived as JSON numbers. The `pg` driver instead
 * hands back JS `Date` objects for timestamps and STRINGS for int8/numeric.
 * Left alone, that difference would silently break hundreds of call sites —
 * `row.created_at.slice(0, 10)` throws on a Date, and `total > 0` compares a
 * string. So the parsers below are pinned to match PostgREST's JSON output.
 * ---------------------------------------------------------------------------
 */

const OID = {
  INT8: 20,
  NUMERIC: 1700,
  DATE: 1082,
  TIMESTAMP: 1114,
  TIMESTAMPTZ: 1184,
} as const;

/**
 * Postgres renders a timestamptz as `2026-07-27 10:11:08.26+00`; PostgREST
 * rendered the same value as `2026-07-27T10:11:08.26+00:00`. Both parse with
 * `new Date()`, but only the second survives the string slicing and equality
 * checks scattered through the app, so the wire format is normalised here
 * rather than at every call site.
 */
function toIsoString(raw: string): string {
  let s = raw.replace(" ", "T");
  // `+00` / `-0530` -> `+00:00` / `-05:30`; a bare timestamp (no zone) is left
  // as-is, exactly as PostgREST left `timestamp without time zone` alone.
  s = s.replace(/([+-])(\d{2})$/, "$1$2:00");
  s = s.replace(/([+-])(\d{2})(\d{2})$/, "$1$2:$3");
  return s;
}

let parsersInstalled = false;

function installTypeParsers() {
  if (parsersInstalled) return;
  parsersInstalled = true;

  const { types } = requirePg();
  types.setTypeParser(OID.TIMESTAMPTZ, (v) => (v === null ? null : toIsoString(v)));
  types.setTypeParser(OID.TIMESTAMP, (v) => (v === null ? null : toIsoString(v)));
  // A `date` column is a calendar day. PostgREST sent "2026-07-27"; parsing it
  // into a Date would drag the machine's timezone into a value that has none.
  types.setTypeParser(OID.DATE, (v) => v);
  // Safe as JS numbers at this application's magnitudes (counters, page counts,
  // byte sizes, rupee amounts) and matches the JSON numbers the app expects.
  types.setTypeParser(OID.INT8, (v) => (v === null ? null : Number(v)));
  types.setTypeParser(OID.NUMERIC, (v) => (v === null ? null : Number(v)));
}

export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  max: number;
}

/**
 * Connection settings, from either a single DATABASE_URL or the discrete
 * DB_* variables. DATABASE_URL wins when both are present so a hosting
 * platform that injects one keeps working.
 */
export function readDbConfig(): DbConfig {
  const max = Number(process.env.DB_POOL_MAX ?? 10);
  const url = process.env.DATABASE_URL?.trim();

  if (url) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error("DATABASE_URL is set but is not a valid connection URL.");
    }
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 5432),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.replace(/^\//, "") || "postgres",
      max,
    };
  }

  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  const missing = Object.entries({ DB_HOST, DB_USER, DB_PASSWORD, DB_NAME })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(
      `Database is not configured — missing ${missing.join(", ")}. ` +
        "Set DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME, or a single DATABASE_URL.",
    );
  }

  return {
    host: DB_HOST!,
    port: Number(DB_PORT ?? 5432),
    user: DB_USER!,
    password: DB_PASSWORD!,
    database: DB_NAME!,
    max,
  };
}

/**
 * Cached on globalThis, not in a module-level variable: Next.js reloads modules
 * on every edit in dev, and a per-module pool would leak a fresh set of
 * connections on each reload until the server hit the DB's connection limit.
 */
declare global {
  // eslint-disable-next-line no-var
  var __gbaDbPool: Pool | undefined;
}

export function getPool(): Pool {
  if (globalThis.__gbaDbPool) return globalThis.__gbaDbPool;

  installTypeParsers();
  const cfg = readDbConfig();

  const pool = new (requirePg().Pool)({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    max: cfg.max,
    // TLS is opt-in via DB_SSL. The current server does not offer it (verified:
    // `sslmode=require` is refused with "server does not support SSL"), so
    // requesting it would fail every connection — which also means database
    // traffic is unencrypted and belongs on a private network. See db/README.md.
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    // OCR, AI drafting and ZIP imports hold a connection across slow work;
    // without a ceiling a wedged query would pin a connection indefinitely.
    statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS ?? 120_000),
  });

  // An idle client erroring (server restart, network drop) emits on the pool.
  // Unhandled, that event takes the whole Node process down.
  pool.on("error", (err) => {
    console.error("[db] idle client error:", err.message);
  });

  globalThis.__gbaDbPool = pool;
  return pool;
}

export interface SqlResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

/** Runs one parameterised statement. Values are ALWAYS bound, never inlined. */
export async function sql<T = Record<string, unknown>>(
  text: string,
  values: unknown[] = [],
): Promise<SqlResult<T>> {
  const res = await getPool().query(text, values);
  return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
}
