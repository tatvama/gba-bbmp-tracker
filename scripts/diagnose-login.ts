/**
 * Read-only diagnosis of a login/"already registered" mismatch for one email.
 * Never mutates anything — just reports what's actually on record.
 *
 *   npx tsx --tsconfig scripts/tsconfig.pipeline.json scripts/diagnose-login.ts <email>
 *
 * Accounts live in public.app_users now (Supabase's auth.users is gone), so this
 * queries that table directly instead of paging a remote admin API.
 */
import { loadEnv } from "./db";
loadEnv();

const targetEmail: string = process.argv[2] ?? "";
if (!targetEmail) {
  console.error("Usage: diagnose-login.ts <email>");
  process.exit(1);
}

async function main() {
  const { createAdminClient } = await import("@/lib/db");
  const { getPool } = await import("@/lib/db/pool");
  const admin = createAdminClient();

  console.log(`\n── Searching public.app_users for ${targetEmail} ──`);
  const { data: users, error: userErr } = await admin
    .from("app_users")
    .select(
      "id, email, phone, email_confirmed_at, created_at, last_sign_in_at, banned_until, raw_user_meta_data, encrypted_password",
    )
    .ilike("email", targetEmail);

  if (userErr) {
    console.error(`✗ app_users query failed: ${userErr.message}`);
    await getPool().end();
    process.exit(1);
  }

  const match = users?.[0];
  if (!match) {
    console.log("✗ No app_users row matches this email at all (case-insensitive).");
  } else {
    console.log("✓ Found a matching app_users row:");
    console.log(`  id                : ${match.id}`);
    console.log(`  email (exact case): ${match.email}`);
    console.log(`  email_confirmed_at: ${match.email_confirmed_at ?? "(never confirmed)"}`);
    console.log(`  phone             : ${match.phone || "(none)"}`);
    console.log(`  created_at        : ${match.created_at}`);
    console.log(`  last_sign_in_at   : ${match.last_sign_in_at ?? "(never signed in)"}`);
    console.log(`  banned_until      : ${match.banned_until ?? "(not banned)"}`);
    console.log(`  metadata          : ${JSON.stringify(match.raw_user_meta_data)}`);
    // The hash itself is never printed — only whether one is set, and which
    // bcrypt variant it uses, which is what actually matters when a password
    // stops working after a migration.
    const hash = match.encrypted_password as string | null;
    console.log(
      `  password          : ${hash ? `set (${hash.slice(0, 4)} variant, ${hash.length} chars)` : "(NOT SET — cannot sign in)"}`,
    );
    if (users.length > 1) {
      console.log(`⚠ ${users.length} app_users rows match this email — sign-in requires exactly one.`);
    }
  }

  console.log(`\n── Searching public.profiles for ${targetEmail} ──`);
  const { data: profileRows, error: profileErr } = await admin
    .from("profiles")
    .select("id, email, name, role, phone, created_at")
    .ilike("email", targetEmail);
  if (profileErr) console.error(`✗ profiles query failed: ${profileErr.message}`);
  else if (!profileRows?.length) console.log("✗ No profiles row matches this email.");
  else for (const row of profileRows) console.log(`✓ profiles row: ${JSON.stringify(row)}`);

  if (match && profileRows && !profileRows.some((r: { id: string }) => r.id === match.id)) {
    console.log(
      "\n⚠ MISMATCH: app_users has this account, but no profiles row shares its id — " +
        "the account will resolve to the VIEWER role.",
    );
  }

  await getPool().end();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
