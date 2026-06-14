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

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "\n✗ DATABASE_URL is not set in .env.\n" +
        "  Add your Supabase Postgres connection string:\n" +
        "  Dashboard → Project Settings → Database → Connection string → URI\n",
    );
    process.exit(1);
  }
  return url;
}

export function makeClient(url: string): Client {
  const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
  return new Client({
    connectionString: url,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
}
