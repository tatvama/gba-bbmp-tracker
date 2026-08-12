import { describe, it, expect, vi } from "vitest";

/**
 * Regression test for a production-stabilization audit finding:
 * lib/queries.ts#listRepliesDueSoon (the dashboard's "replies due soon"
 * widget) was the one query against `complaints` (of 20 total) that never
 * filtered out soft-deleted rows — deleteComplaint() only sets `deleted_at`,
 * it doesn't clear escalation_stage, so a soft-deleted complaint that was
 * mid-escalation would still surface on the dashboard as if still active.
 * Locks in the added `.is("deleted_at", null)` against the real function.
 */

function makeQueryBuilder(result: { data: unknown[]; error?: unknown }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {
    select: (...a: unknown[]) => (calls.push({ method: "select", args: a }), builder),
    is: (...a: unknown[]) => (calls.push({ method: "is", args: a }), builder),
    in: (...a: unknown[]) => (calls.push({ method: "in", args: a }), builder),
    gte: (...a: unknown[]) => (calls.push({ method: "gte", args: a }), builder),
    lte: (...a: unknown[]) => (calls.push({ method: "lte", args: a }), builder),
    order: (...a: unknown[]) => (calls.push({ method: "order", args: a }), builder),
    limit: (...a: unknown[]) => (calls.push({ method: "limit", args: a }), builder),
    then: (resolve: (v: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    __calls: calls,
  };
  return builder;
}

let builder: ReturnType<typeof makeQueryBuilder>;
vi.mock("@/lib/db", () => ({
  createClient: vi.fn(async () => ({ from: (table: string) => (table === "complaints" ? builder : makeQueryBuilder({ data: [] })) })),
}));

describe("listRepliesDueSoon — excludes soft-deleted complaints", () => {
  it("filters on deleted_at IS NULL", async () => {
    builder = makeQueryBuilder({ data: [] });
    const { listRepliesDueSoon } = await import("@/lib/queries");
    await listRepliesDueSoon();
    const calls = builder.__calls as { method: string; args: unknown[] }[];
    expect(calls).toContainEqual({ method: "is", args: ["deleted_at", null] });
  });
});
