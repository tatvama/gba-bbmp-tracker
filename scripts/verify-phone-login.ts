/**
 * End-to-end verification of email-or-phone sign-in against the REAL
 * Supabase Auth project — creates a disposable test account with both an
 * email and a phone identifier, signs in both ways, and deletes the account
 * whether it passes or fails.
 *
 *   npx tsx --tsconfig scripts/tsconfig.pipeline.json scripts/verify-phone-login.ts
 *
 * Uses a fake, clearly-test phone number and email — never a real person's.
 * If Supabase's Phone auth provider is not enabled in the Dashboard, the
 * phone-identifier steps fail with an actionable message; this script reports
 * that rather than silently passing.
 */
import { loadEnv } from "./db";
loadEnv();

const TEST_EMAIL = "verify-phone-login-test@example.com";
const TEST_PHONE = "+919000000001"; // fake, valid-format Indian mobile — not a real number
const TEST_PASSWORD = "VerifyPhoneLogin!2026";

async function main() {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { createClient: createBrowserClient } = await import("@supabase/supabase-js");
  const admin = createAdminClient();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

  let userId: string | undefined;

  try {
    console.log("── Creating disposable test user (email + phone) ──");
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      phone: TEST_PHONE,
      password: TEST_PASSWORD,
      email_confirm: true,
      phone_confirm: true,
      user_metadata: { name: "Verify Phone Login (test)", role: "VIEWER" },
    });
    if (error) {
      console.error(`✗ createUser failed: ${error.message}`);
      if (/phone/i.test(error.message)) {
        console.error("  → This looks like the Phone auth provider is NOT enabled in Supabase Dashboard → Authentication → Providers.");
      }
      process.exitCode = 1;
      return;
    }
    userId = data.user?.id;
    console.log(`  ✓ created user ${userId}`);

    console.log("\n── Signing in with EMAIL + password ──");
    const clientForEmail = createBrowserClient(url, anonKey);
    const emailResult = await clientForEmail.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
    if (emailResult.error) {
      console.error(`✗ Email sign-in FAILED: ${emailResult.error.message}`);
      process.exitCode = 1;
    } else {
      console.log(`  ✓ Email sign-in succeeded (session for user ${emailResult.data.user?.id})`);
    }

    console.log("\n── Signing in with PHONE + password ──");
    const clientForPhone = createBrowserClient(url, anonKey);
    const phoneResult = await clientForPhone.auth.signInWithPassword({ phone: TEST_PHONE, password: TEST_PASSWORD });
    if (phoneResult.error) {
      console.error(`✗ Phone sign-in FAILED: ${phoneResult.error.message}`);
      if (/phone|provider/i.test(phoneResult.error.message)) {
        console.error("  → Enable the Phone provider in Supabase Dashboard → Authentication → Providers to allow this.");
      }
      process.exitCode = 1;
    } else {
      console.log(`  ✓ Phone sign-in succeeded (session for user ${phoneResult.data.user?.id})`);
    }
  } finally {
    if (userId) {
      console.log("\n── Cleaning up: deleting the disposable test user ──");
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) console.error(`✗ COULD NOT DELETE test user ${userId}: ${error.message} — remove it manually.`);
      else console.log("  ✓ deleted");
    }
  }
}

main().then(() => process.exit(process.exitCode ?? 0)).catch((e) => {
  console.error("\n✗ verification crashed:", e instanceof Error ? e.stack : e);
  process.exit(1);
});
