/**
 * Creates (or promotes) an ADMIN user directly in the application's database.
 *
 *   npm run db:create-admin -- admin@example.com "StrongPass123" "Admin Name"
 *
 * Requires the DB_* (or DATABASE_URL) settings in .env. Passwords are hashed by
 * Postgres via pgcrypto — see lib/db/auth.ts.
 */
import { createDbClient } from "../lib/db";
import {
  createAuthUser,
  updateAuthUserPassword,
  updateAuthUserRole,
} from "../lib/db/auth";
import { getPool } from "../lib/db/pool";
import { loadEnv } from "./db";

loadEnv();

async function main() {
  const [email, password, ...nameParts] = process.argv.slice(2);
  const name = nameParts.join(" ") || (email ? email.split("@")[0] : "Admin");

  if (!email || !password) {
    console.error('Usage: npm run db:create-admin -- <email> <password> ["Full Name"]');
    process.exit(1);
  }

  const db = createDbClient();

  const created = await createAuthUser({
    email,
    password,
    name: name ?? "Admin",
    role: "ADMIN",
    phone: null,
  });

  if (created.id) {
    console.log(`✓ Admin created: ${email}`);
    await getPool().end();
    return;
  }

  // Already present — promote them and reset the password to the one given.
  const { data: existing } = await db
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (!existing?.id) {
    console.error("✗ Failed to create user:", created.error);
    await getPool().end();
    process.exit(1);
  }

  await updateAuthUserPassword(existing.id as string, password);
  await updateAuthUserRole(existing.id as string, "ADMIN");
  await db
    .from("profiles")
    .update({ email, name })
    .eq("id", existing.id as string);

  console.log(`→ Existing user updated and promoted to ADMIN: ${email}`);
  await getPool().end();
}

main().catch(async (e) => {
  console.error(e);
  await getPool().end().catch(() => {});
  process.exit(1);
});
