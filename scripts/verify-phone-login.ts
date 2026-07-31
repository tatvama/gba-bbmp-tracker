/**
 * End-to-end verification of email-or-phone sign-in against the REAL
 * Supabase Auth project — creates a disposable test account, links a phone
 * via profiles, and verifies both sign-in paths the app actually uses:
 *   - email + password → supabase.auth.signInWithPassword({ email })
 *   - phone + password → resolve phone to email via profiles, then the same
 *     signInWithPassword({ email }) call (see app/login/actions.ts)
 * Deletes the account whether it passes or fails.
 *
 *   npx tsx --tsconfig scripts/tsconfig.pipeline.json scripts/verify-phone-login.ts
 *
 * Uses a fake, clearly-test phone number and email — never a real person's.
 * Deliberately does NOT exercise Supabase's native phone-identifier auth
 * (signInWithPassword({ phone })) — that requires an SMS provider (e.g.
 * Twilio) configured project-wide, which this app avoids entirely by
 * resolving phone → email in our own code instead.
 */
import { loadEnv } from "./db";
loadEnv();

const TEST_EMAIL = "verify-phone-login-test@example.com";
const TEST_PHONE_E164 = "+919000000001"; // fake, valid-format Indian mobile — not a real number
const TEST_PASSWORD = "VerifyPhoneLogin!2026";

async function main() {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { createClient: createBrowserClient } = await import("@supabase/supabase-js");
  const admin = createAdminClient();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

  let userId: string | undefined;

  try {
    console.log("── Creating disposable test user (email + password) ──");
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { name: "Verify Phone Login (test)", role: "VIEWER" },
    });
    if (error) {
      console.error(`✗ createUser failed: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    userId = data.user?.id;
    console.log(`  ✓ created user ${userId}`);

    console.log("\n── Linking phone via profiles (the app's own resolution path) ──");
    const { error: profileErr } = await admin.from("profiles").update({ phone: TEST_PHONE_E164 }).eq("id", userId);
    if (profileErr) {
      console.error(`✗ Could not set profiles.phone: ${profileErr.message}`);
      process.exitCode = 1;
      return;
    }
    console.log("  ✓ profiles.phone set");

    console.log("\n── Signing in with EMAIL + password ──");
    const clientForEmail = createBrowserClient(url, anonKey);
    const emailResult = await clientForEmail.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
    if (emailResult.error) {
      console.error(`✗ Email sign-in FAILED: ${emailResult.error.message}`);
      process.exitCode = 1;
    } else {
      console.log(`  ✓ Email sign-in succeeded (session for user ${emailResult.data.user?.id})`);
    }

    console.log("\n── Resolving PHONE → email via profiles, then signing in (app's actual login path) ──");
    const { data: matches } = await admin.from("profiles").select("email").eq("phone", TEST_PHONE_E164).limit(2);
    const resolvedEmail = matches && matches.length === 1 ? matches[0]?.email : undefined;
    if (!resolvedEmail) {
      console.error("✗ Phone → email resolution FAILED: no unique profiles match");
      process.exitCode = 1;
    } else {
      const clientForPhone = createBrowserClient(url, anonKey);
      const phoneResult = await clientForPhone.auth.signInWithPassword({ email: resolvedEmail, password: TEST_PASSWORD });
      if (phoneResult.error) {
        console.error(`✗ Phone-resolved sign-in FAILED: ${phoneResult.error.message}`);
        process.exitCode = 1;
      } else {
        console.log(`  ✓ Phone-resolved sign-in succeeded (session for user ${phoneResult.data.user?.id})`);
      }
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
