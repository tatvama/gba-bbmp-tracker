/**
 * Creates (or promotes) an ADMIN user via the Supabase service-role API.
 *
 *   npm run db:create-admin -- admin@example.com "StrongPass123" "Admin Name"
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in .env.
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./db";

loadEnv();

async function main() {
  const [email, password, ...nameParts] = process.argv.slice(2);
  const name = nameParts.join(" ") || (email ? email.split("@")[0] : "Admin");

  if (!email || !password) {
    console.error('Usage: npm run db:create-admin -- <email> <password> ["Full Name"]');
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("✗ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env");
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Try to create; if the user already exists, find + promote them.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role: "ADMIN" },
  });

  let userId = data?.user?.id;

  if (error) {
    if (/already.*registered|exists/i.test(error.message)) {
      const { data: list } = await admin.auth.admin.listUsers();
      userId = list.users.find((u) => u.email === email)?.id;
      if (!userId) {
        console.error("✗ User exists but could not be located:", error.message);
        process.exit(1);
      }
      await admin.auth.admin.updateUserById(userId, {
        password,
        user_metadata: { name, role: "ADMIN" },
      });
      console.log("→ Existing user updated.");
    } else {
      console.error("✗ Failed to create user:", error.message);
      process.exit(1);
    }
  }

  // Ensure the profile row reflects ADMIN (the trigger sets it on insert, but
  // updating metadata above does not re-fire it).
  if (userId) {
    await admin
      .from("profiles")
      .upsert({ id: userId, email, name, role: "ADMIN" }, { onConflict: "id" });
  }

  console.log(`✓ Admin ready: ${email}`);
}

main();
