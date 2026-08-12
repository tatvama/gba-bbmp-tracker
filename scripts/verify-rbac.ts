/**
 * Verify RBAC end-to-end against the REAL database: for each of the app's 7
 * roles, create a disposable account via createAuthUser (lib/db/auth.ts, the
 * same function the admin Create User form calls), confirm it actually persists
 * that role onto `profiles.role`, then feed that REAL, DB-read role through the
 * app's real `hasRole()` (lib/auth.ts) against every role-gate constant used
 * across the app (lib/constants.ts). Deletes every test user whether it passes
 * or fails.
 *
 *   npx tsx --tsconfig scripts/tsconfig.pipeline.json scripts/verify-rbac.ts
 *
 * WRITES TO THE CONFIGURED DATABASE: seven clearly-marked test accounts,
 * removed in a finally block.
 *
 * Scope, stated honestly: this proves the createAuthUser -> profiles.role ->
 * hasRole() pipeline is correct for all 7 roles against all 6 role-gate
 * constants — i.e. "does a COMPLAINT_MANAGER account really resolve to a role
 * that COMPLAINT_WRITE_ROLES accepts and RTI_WRITE_ROLES rejects." It does NOT
 * make a live HTTP request through middleware/an API route — the "does every
 * route actually call requireRole/hasRole" wiring question is answered
 * separately by the static nav-items.ts / page-guard cross-check, and "does
 * requireRole throw the right error for a disallowed role" is covered by mocked
 * unit tests (__tests__ — mocking getSessionUser is trivial in Vitest; faking a
 * real Next.js cookie session is not).
 */
import { loadEnv } from "./db";
loadEnv();

const TEST_PASSWORD = "VerifyRbac!2026";

async function main() {
  const { createAdminClient } = await import("@/lib/db");
  const { createAuthUser, deleteAuthUser } = await import("@/lib/db/auth");
  const { hasRole } = await import("@/lib/auth");
  const {
    USER_ROLES,
    WRITE_ROLES,
    VERIFY_ROLES,
    RTI_WRITE_ROLES,
    COMPLAINT_WRITE_ROLES,
    COMPLAINT_FIELD_ROLES,
    COMPLAINT_VERIFY_ROLES,
  } = await import("@/lib/constants");
  const admin = createAdminClient();

  const ROLE_GATES: Record<string, string[]> = {
    WRITE_ROLES,
    VERIFY_ROLES,
    RTI_WRITE_ROLES,
    COMPLAINT_WRITE_ROLES,
    COMPLAINT_FIELD_ROLES,
    COMPLAINT_VERIFY_ROLES,
    "ADMIN_ONLY (settings/rti-settings/audit)": ["ADMIN"],
  };

  const createdUserIds: string[] = [];
  let failures = 0;

  try {
    for (const role of USER_ROLES) {
      const email = `verify-rbac-${role.toLowerCase()}-test@example.com`;
      console.log(`\n── ${role} ──`);

      const created = await createAuthUser({
        email,
        password: TEST_PASSWORD,
        name: `Verify RBAC (${role}, test)`,
        role,
        phone: null,
      });
      if (!created.id) {
        console.error(`  ✗ createAuthUser failed: ${created.error}`);
        failures++;
        continue;
      }
      const newUserId = created.id;
      createdUserIds.push(newUserId);

      // Confirm the role was actually persisted (not assumed). createAuthUser
      // writes the profiles row itself, replacing Supabase's auth.users trigger.
      const { data: profile, error: profileErr } = await admin
        .from("profiles")
        .select("role")
        .eq("id", newUserId)
        .single();
      if (profileErr || !profile) {
        console.error(`  ✗ could not read back profiles.role: ${profileErr?.message}`);
        failures++;
        continue;
      }
      const persistedRole = (profile as { role: string }).role;
      if (persistedRole !== role) {
        console.error(`  ✗ createAuthUser persisted role="${persistedRole}", expected "${role}"`);
        failures++;
        continue;
      }
      console.log(`  ✓ profiles.role persisted correctly as "${persistedRole}"`);

      const sessionUser = { id: newUserId, email, profile: profile as never, role: persistedRole as never };

      for (const [gateName, allowedRoles] of Object.entries(ROLE_GATES)) {
        const expected = allowedRoles.includes(role);
        const actual = hasRole(sessionUser as never, allowedRoles as never);
        if (actual !== expected) {
          console.error(`  ✗ ${gateName}: expected allowed=${expected}, hasRole() returned ${actual}`);
          failures++;
        } else {
          console.log(`  ✓ ${gateName}: allowed=${actual} (correct)`);
        }
      }
    }
  } finally {
    console.log(`\n── Cleaning up ${createdUserIds.length} disposable test user(s) ──`);
    for (const id of createdUserIds) {
      try {
        await deleteAuthUser(id);
      } catch (e) {
        console.error(`  ✗ COULD NOT DELETE test user ${id}: ${e} — remove it manually.`);
      }
    }
    console.log("  ✓ done");
  }

  if (failures > 0) {
    console.error(`\n✗ ${failures} RBAC assertion(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log(`\n✓ All roles × all role-gates resolved correctly (${USER_ROLES.length} roles × ${Object.keys(ROLE_GATES).length} gates).`);
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error("\n✗ verification crashed:", e instanceof Error ? e.stack : e);
    process.exit(1);
  });
