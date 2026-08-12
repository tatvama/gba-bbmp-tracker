/**
 * End-to-end verification of email-or-phone sign-in against the application's
 * own database — creates a disposable test account, links a phone via profiles,
 * and verifies both sign-in paths app/login/actions.ts actually uses:
 *   - email + password → verifyCredentials(email, password)
 *   - phone + password → findEmailByPhone(), then the same verifyCredentials call
 * Also confirms a wrong password is rejected, and that a signed session token
 * round-trips. Deletes the account whether it passes or fails.
 *
 *   npx tsx --tsconfig scripts/tsconfig.pipeline.json scripts/verify-phone-login.ts
 *
 * WRITES TO THE CONFIGURED DATABASE: it inserts one clearly-marked test account
 * and removes it in a finally block. Point DB_* at a scratch database if you do
 * not want that touching production, however briefly.
 *
 * Uses a fake, clearly-test phone number and email — never a real person's.
 */
import { loadEnv } from "./db";
loadEnv();

const TEST_EMAIL = "verify-phone-login-test@example.com";
const TEST_PHONE_E164 = "+919000000001"; // fake, valid-format Indian mobile — not a real number
const TEST_PASSWORD = "VerifyPhoneLogin!2026";

async function main() {
  const { createAdminClient } = await import("@/lib/db");
  const { getPool } = await import("@/lib/db/pool");
  const { createAuthUser, verifyCredentials, findEmailByPhone, deleteAuthUser } = await import(
    "@/lib/db/auth"
  );
  const { signSessionToken, verifySessionToken } = await import("@/lib/session");
  const admin = createAdminClient();

  let userId: string | undefined;

  try {
    console.log("── Creating disposable test user (email + password) ──");
    const created = await createAuthUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      name: "Verify Phone Login (test)",
      role: "VIEWER",
      phone: null,
    });
    if (!created.id) {
      console.error(`✗ createAuthUser failed: ${created.error}`);
      process.exitCode = 1;
      return;
    }
    userId = created.id;
    console.log(`  ✓ created user ${userId}`);

    console.log("\n── Profile row created alongside it (replaces the old auth trigger) ──");
    const { data: profile } = await admin
      .from("profiles")
      .select("id, email, role")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.role === "VIEWER") console.log("  ✓ profiles row present with the requested role");
    else {
      console.error(`✗ profile missing or wrong role: ${JSON.stringify(profile)}`);
      process.exitCode = 1;
    }

    console.log("\n── Linking phone via profiles (the app's own resolution path) ──");
    const { error: profileErr } = await admin
      .from("profiles")
      .update({ phone: TEST_PHONE_E164 })
      .eq("id", userId);
    if (profileErr) {
      console.error(`✗ Could not set profiles.phone: ${profileErr.message}`);
      process.exitCode = 1;
      return;
    }
    console.log("  ✓ profiles.phone set");

    console.log("\n── Signing in with EMAIL + password ──");
    const byEmail = await verifyCredentials(TEST_EMAIL, TEST_PASSWORD);
    if (!byEmail.user) {
      console.error("✗ Email sign-in FAILED");
      process.exitCode = 1;
    } else {
      console.log(`  ✓ Email sign-in succeeded (user ${byEmail.user.id})`);
    }

    console.log("\n── Case-insensitive email, as Supabase Auth treated it ──");
    const upper = await verifyCredentials(TEST_EMAIL.toUpperCase(), TEST_PASSWORD);
    if (upper.user) console.log("  ✓ Uppercased email still signs in");
    else {
      console.error("✗ Uppercased email was rejected");
      process.exitCode = 1;
    }

    console.log("\n── Resolving PHONE → email, then signing in (app's actual login path) ──");
    const resolvedEmail = await findEmailByPhone(TEST_PHONE_E164);
    if (!resolvedEmail) {
      console.error("✗ Phone → email resolution FAILED: no unique profiles match");
      process.exitCode = 1;
    } else {
      const byPhone = await verifyCredentials(resolvedEmail, TEST_PASSWORD);
      if (!byPhone.user) {
        console.error("✗ Phone-resolved sign-in FAILED");
        process.exitCode = 1;
      } else {
        console.log(`  ✓ Phone-resolved sign-in succeeded (user ${byPhone.user.id})`);
      }
    }

    console.log("\n── A wrong password must be rejected ──");
    const wrong = await verifyCredentials(TEST_EMAIL, "definitely-not-the-password");
    if (wrong.user) {
      console.error("✗ SECURITY: a wrong password was ACCEPTED");
      process.exitCode = 1;
    } else {
      console.log("  ✓ Wrong password rejected");
    }

    console.log("\n── Session token round-trip ──");
    const token = await signSessionToken(userId);
    const payload = await verifySessionToken(token);
    if (payload?.uid !== userId) {
      console.error(`✗ Session token did not verify back to the user (${JSON.stringify(payload)})`);
      process.exitCode = 1;
    } else {
      console.log("  ✓ Token signs and verifies");
    }

    const tampered = await verifySessionToken(`${token.slice(0, -2)}xy`);
    if (tampered) {
      console.error("✗ SECURITY: a tampered token verified");
      process.exitCode = 1;
    } else {
      console.log("  ✓ Tampered token rejected");
    }

    const expired = await verifySessionToken(token, Date.now() + 1000 * 60 * 60 * 24 * 365);
    if (expired) {
      console.error("✗ An expired token verified");
      process.exitCode = 1;
    } else {
      console.log("  ✓ Expired token rejected");
    }
  } finally {
    if (userId) {
      console.log("\n── Cleaning up: deleting the disposable test user ──");
      try {
        await deleteAuthUser(userId);
        const { data: still } = await admin
          .from("app_users")
          .select("id")
          .eq("id", userId)
          .maybeSingle();
        if (still) {
          console.error(`✗ COULD NOT DELETE test user ${userId} — remove it manually.`);
          process.exitCode = 1;
        } else {
          console.log("  ✓ deleted");
        }
      } catch (e) {
        console.error(`✗ COULD NOT DELETE test user ${userId}: ${e} — remove it manually.`);
        process.exitCode = 1;
      }
    }
    await getPool().end().catch(() => {});
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error("\n✗ verification crashed:", e instanceof Error ? e.stack : e);
    process.exit(1);
  });
