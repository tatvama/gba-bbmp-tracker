/** Shared helpers for the migrate/seed scripts (run via tsx, outside Next). */
import { Client } from "pg";

export function loadEnv() {
  try {
    // Node >= 20.12 / 24 — loads .env from CWD into process.env.
    (process as unknown as { loadEnvFile: (p?: string) => void }).loadEnvFile();
  } catch {
    // .env may already be loaded or absent; continue.
  }
}

/**
 * DATABASE_URL, or one assembled from the discrete DB_* variables the app uses.
 * Accepting both means `npm run db:migrate` works from the same .env as the app
 * without duplicating the connection string.
 */
export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url) return url;

  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (DB_HOST && DB_USER && DB_PASSWORD && DB_NAME) {
    const auth = `${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD)}`;
    return `postgresql://${auth}@${DB_HOST}:${DB_PORT ?? 5432}/${DB_NAME}`;
  }

  console.error(
    "\n✗ No database configuration found in .env.\n" +
      "  Set either DATABASE_URL, or DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME.\n",
  );
  process.exit(1);
}

export function makeClient(url: string): Client {
  // TLS is OFF unless DB_SSL=true. The previous rule — "SSL for anything that
  // isn't localhost" — was right for Supabase, which required it, but the
  // current server does not offer TLS at all and refuses the connection when it
  // is requested. Set DB_SSL=true once the server terminates TLS.
  const useSsl = process.env.DB_SSL === "true";
  return new Client({
    connectionString: url,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  });
}
