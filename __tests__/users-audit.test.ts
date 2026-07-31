import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression test for a gap found during the production-stabilization audit:
 * lib/actions/users.ts (createUser/updateUserPhone/updateUserRole) never
 * called writeAudit, unlike every other mutating action file in the app —
 * so promoting a user to ADMIN left no audit_logs trace. This locks in the
 * fix (writeAudit calls added to all three) against the real functions.
 */

const insertedAuditRows: Record<string, unknown>[] = [];
const profilesTable: Record<string, { role?: string; phone?: string | null }> = {};

function makeAdminClient() {
  return {
    auth: {
      admin: {
        createUser: vi.fn(async (opts: { email: string }) => ({
          data: { user: { id: "new-user-1", email: opts.email } },
          error: null,
        })),
        updateUserById: vi.fn(async () => ({ data: {}, error: null })),
        getUserById: vi.fn(async () => ({ data: { user: { user_metadata: { role: "VIEWER" } } } })),
      },
    },
    from: (table: string) => {
      if (table === "audit_logs") {
        return {
          insert: vi.fn(async (rows: Record<string, unknown>[]) => {
            insertedAuditRows.push(...rows);
            return { error: null };
          }),
        };
      }
      if (table === "profiles") {
        const builder: Record<string, unknown> = {
          upsert: vi.fn(async (row: { id: string; role?: string; phone?: string | null }) => {
            profilesTable[row.id] = { role: row.role, phone: row.phone };
            return { data: null, error: null };
          }),
          select: () => builder,
          eq: (_col: string, id: string) => {
            (builder as { __id?: string }).__id = id;
            return builder;
          },
          maybeSingle: async () => ({ data: profilesTable[(builder as { __id?: string }).__id ?? ""] ?? null, error: null }),
          update: (patch: { role?: string; phone?: string | null }) => {
            const id = (builder as { __id?: string }).__id;
            return {
              eq: async (_col: string, eqId: string) => {
                profilesTable[eqId ?? id ?? ""] = { ...profilesTable[eqId ?? id ?? ""], ...patch };
                return { data: null, error: null };
              },
            };
          },
        };
        return builder;
      }
      throw new Error(`unexpected table in test: ${table}`);
    },
  };
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => makeAdminClient()) }));
vi.mock("@/lib/auth", () => ({
  requireRole: vi.fn(async () => ({ id: "acting-admin-1", email: "admin@example.com", profile: null, role: "ADMIN" })),
  AuthorizationError: class AuthorizationError extends Error {},
}));

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("lib/actions/users.ts — audit logging (real functions, not a copy)", () => {
  beforeEach(() => {
    insertedAuditRows.length = 0;
    profilesTable["existing-user-1"] = { role: "VIEWER" };
  });

  it("createUser writes an audit row recording the granted role", async () => {
    const { createUser } = await import("@/lib/actions/users");
    // A real <form> always includes every rendered <input>'s key (empty string
    // if left blank) — only a hand-built FormData omitting a key entirely would
    // hit z.string().optional()'s null-vs-undefined gap, which the real
    // CreateUserForm's always-rendered inputs never do.
    const result = await createUser({}, formData({ email: "new@example.com", password: "password123", role: "EDITOR", phone: "", name: "" }));
    expect(result.success).toBe(true);
    expect(insertedAuditRows).toContainEqual(
      expect.objectContaining({ entity_type: "user", entity_id: "new-user-1", field_name: "role", new_value: "EDITOR", changed_by: "acting-admin-1" }),
    );
  });

  it("updateUserRole writes an audit row with the old AND new role", async () => {
    const { updateUserRole } = await import("@/lib/actions/users");
    const result = await updateUserRole("existing-user-1", {}, formData({ role: "ADMIN" }));
    expect(result.success).toBe(true);
    expect(insertedAuditRows).toContainEqual(
      expect.objectContaining({
        entity_type: "user",
        entity_id: "existing-user-1",
        field_name: "role",
        old_value: "VIEWER",
        new_value: "ADMIN",
        changed_by: "acting-admin-1",
      }),
    );
  });

  it("updateUserPhone writes an audit row", async () => {
    const { updateUserPhone } = await import("@/lib/actions/users");
    const result = await updateUserPhone("existing-user-1", {}, formData({ phone: "9876543210" }));
    expect(result.success).toBe(true);
    expect(insertedAuditRows).toContainEqual(
      expect.objectContaining({ entity_type: "user", entity_id: "existing-user-1", field_name: "phone", changed_by: "acting-admin-1" }),
    );
  });
});
