import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression test for a production-stabilization audit finding:
 * deleteAckBatchAction's R2 cleanup previously swallowed failures with
 * `.catch(() => {})` — an R2 outage would leave orphaned files with zero
 * trace in the logs. Locks in the fix (logged .catch, still best-effort)
 * against the real exported action.
 */

const warnSpy = vi.fn();
vi.spyOn(console, "warn").mockImplementation(warnSpy);

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireRole: vi.fn(async () => ({ id: "user-1", email: "u@example.com", profile: null, role: "COMPLAINT_MANAGER" })),
  AuthorizationError: class AuthorizationError extends Error {},
}));
vi.mock("@/lib/storage/r2-upload", () => ({
  getR2SignedUrl: vi.fn(),
  downloadFromR2: vi.fn(),
  deleteFromR2: vi.fn(async () => {
    throw new Error("R2 bucket temporarily unavailable");
  }),
}));

function makeAdminClient() {
  return {
    from: (table: string) => {
      if (table === "ack_import_batches") {
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          single: async () => ({ data: { original_storage_path: "acks/original-123.pdf" }, error: null }),
          delete: () => builder,
        };
        // .delete().eq(...) needs eq to resolve, not chain further, for this table.
        builder.delete = () => ({ eq: async () => ({ error: null }) });
        return builder;
      }
      if (table === "ack_import_items") {
        return {
          select: () => ({ eq: async () => ({ data: [{ thumb_paths: ["acks/thumb-1.jpg", "acks/thumb-2.jpg"] }] }) }),
        };
      }
      throw new Error(`unexpected table in test: ${table}`);
    },
  };
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => makeAdminClient()) }));

describe("deleteAckBatchAction — R2 cleanup failure is logged, not silent", () => {
  beforeEach(() => {
    warnSpy.mockClear();
  });

  it("still succeeds (DB row removal is authoritative) when R2 cleanup fails", async () => {
    const { deleteAckBatchAction } = await import("@/lib/actions/ack-import");
    const result = await deleteAckBatchAction("batch-1");
    expect(result.ok).toBe(true);
  });

  it("logs a warning for the original file's failed R2 delete", async () => {
    const { deleteAckBatchAction } = await import("@/lib/actions/ack-import");
    await deleteAckBatchAction("batch-1");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("R2 cleanup failed for batch batch-1 (original acks/original-123.pdf)"),
      expect.any(Error),
    );
  });

  it("logs a warning for each failed thumbnail R2 delete", async () => {
    const { deleteAckBatchAction } = await import("@/lib/actions/ack-import");
    await deleteAckBatchAction("batch-1");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("thumb acks/thumb-1.jpg"), expect.any(Error));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("thumb acks/thumb-2.jpg"), expect.any(Error));
  });
});
