/**
 * Read-only diagnosis of a login/"already registered" mismatch for one email.
 * Never mutates anything — just reports what's actually on record.
 *
 *   npx tsx --tsconfig scripts/tsconfig.pipeline.json scripts/diagnose-login.ts <email>
 */
import { loadEnv } from "./db";
loadEnv();

const targetEmail: string = process.argv[2] ?? "";
if (!targetEmail) {
  console.error("Usage: diagnose-login.ts <email>");
  process.exit(1);
}

async function main() {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  console.log(`\n── Searching auth.users for ${targetEmail} ──`);
  let page = 1;
  let match: Awaited<ReturnType<typeof admin.auth.admin.listUsers>>["data"]["users"][number] | undefined;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error(`✗ listUsers failed: ${error.message}`);
      process.exit(1);
    }
    match = data.users.find((u) => (u.email ?? "").toLowerCase() === targetEmail.toLowerCase());
    if (match || data.users.length < 200) break;
    page++;
  }

  if (!match) {
    console.log("✗ No auth.users row matches this email at all (case-insensitive).");
  } else {
    console.log("✓ Found a matching auth.users row:");
    console.log(`  id                : ${match.id}`);
    console.log(`  email (exact case): ${match.email}`);
    console.log(`  email_confirmed_at: ${match.email_confirmed_at ?? "(never confirmed)"}`);
    console.log(`  phone             : ${match.phone || "(none)"}`);
    console.log(`  created_at        : ${match.created_at}`);
    console.log(`  last_sign_in_at   : ${match.last_sign_in_at ?? "(never signed in)"}`);
    console.log(`  banned_until      : ${(match as unknown as { banned_until?: string }).banned_until ?? "(not banned)"}`);
    console.log(`  user_metadata     : ${JSON.stringify(match.user_metadata)}`);
    console.log(`  app_metadata      : ${JSON.stringify(match.app_metadata)}`);
    console.log(`  identities        : ${JSON.stringify(match.identities?.map((i) => ({ provider: i.provider, identity_id: i.identity_id })))}`);
  }

  console.log(`\n── Searching public.profiles for ${targetEmail} ──`);
  const { data: profileRows, error: profileErr } = await admin
    .from("profiles")
    .select("id, email, name, role, phone, created_at")
    .ilike("email", targetEmail);
  if (profileErr) console.error(`✗ profiles query failed: ${profileErr.message}`);
  else if (!profileRows?.length) console.log("✗ No profiles row matches this email.");
  else for (const row of profileRows) console.log(`✓ profiles row: ${JSON.stringify(row)}`);

  if (match && profileRows && !profileRows.some((r) => r.id === match!.id)) {
    console.log("\n⚠ MISMATCH: auth.users has this account, but no profiles row shares its id — the profile upsert may not have run.");
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
