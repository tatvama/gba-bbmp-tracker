import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Verifies lib/actions/complaints.ts#deleteComplaint against the REAL function
 * (previously lib/actions/* had zero test coverage — a production-
 * stabilization audit finding). Two things matter most for this action:
 *   1. It's a SOFT delete (sets deleted_at), never a real row removal —
 *      complaints are audit/legal records.
 *   2. The role gate (ADMIN/COMPLAINT_MANAGER only) is actually enforced,
 *      not just documented.
 */

let currentRole = "COMPLAINT_MANAGER";
const updateCalls: { table: string; patch: Record<string, unknown>; id: string }[] = [];
const auditRows: Record<string, unknown>[] = [];

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireRole: vi.fn(async (allowed: string[]) => {
    if (!allowed.includes(currentRole)) {
      const { AuthorizationError } = await import("@/lib/auth");
      throw new AuthorizationError(`Your role (${currentRole}) cannot perform this action.`);
    }
    return { id: "user-1", email: "u@example.com", profile: null, role: currentRole };
  }),
  AuthorizationError: class AuthorizationError extends Error {},
}));

function makeAdminClient() {
  return {
    from: (table: string) => {
      if (table === "complaints") {
        return {
          update: (patch: Record<string, unknown>) => ({
            eq: async (_col: string, id: string) => {
              updateCalls.push({ table, patch, id });
              return { error: null };
            },
          }),
        };
      }
      if (table === "audit_logs") {
        return { insert: async (rows: Record<string, unknown>[]) => (auditRows.push(...rows), { error: null }) };
      }
      throw new Error(`unexpected table in test: ${table}`);
    },
  };
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => makeAdminClient()) }));

describe("deleteComplaint — real function, soft-delete + RBAC", () => {
  beforeEach(() => {
    updateCalls.length = 0;
    auditRows.length = 0;
  });

  it("sets deleted_at rather than removing the row (soft delete)", async () => {
    currentRole = "COMPLAINT_MANAGER";
    const { deleteComplaint } = await import("@/lib/actions/complaints");
    const result = await deleteComplaint("complaint-1");
    expect(result.success).toBe(true);
    expect(updateCalls).toHaveLength(1);
    const call = updateCalls[0]!;
    expect(call.id).toBe("complaint-1");
    expect(call.patch).toHaveProperty("deleted_at");
    expect(typeof call.patch.deleted_at).toBe("string");
  });

  it("writes an audit_logs row for the deletion", async () => {
    currentRole = "ADMIN";
    const { deleteComplaint } = await import("@/lib/actions/complaints");
    await deleteComplaint("complaint-2");
    expect(auditRows).toContainEqual(expect.objectContaining({ entity_type: "complaint", entity_id: "complaint-2", field_name: "deleted" }));
  });

  it("rejects a role outside ADMIN/COMPLAINT_MANAGER — e.g. VIEWER — without touching the row", async () => {
    currentRole = "VIEWER";
    const { deleteComplaint } = await import("@/lib/actions/complaints");
    const result = await deleteComplaint("complaint-3");
    expect(result).toHaveProperty("error");
    expect(result.success).toBeUndefined();
    expect(updateCalls).toHaveLength(0);
  });

  it("rejects EDITOR too — this action's allowed list is narrower than most complaint writes", async () => {
    currentRole = "EDITOR";
    const { deleteComplaint } = await import("@/lib/actions/complaints");
    const result = await deleteComplaint("complaint-4");
    expect(result).toHaveProperty("error");
    expect(updateCalls).toHaveLength(0);
  });
});
