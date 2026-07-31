import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Exercises the REAL lib/queries.ts#listPrintQueueLetters (previously this
 * file only tested a hand-copied re-implementation of its old filter logic,
 * which had drifted from what the function actually does — the function no
 * longer keeps a printed-but-still-Draft or orphaned letter visible; it is
 * pending-only, both at the DB query (`.eq("print_status", "pending")`) and
 * the trailing in-memory `.filter()`). This test locks in that current,
 * intentional behavior (matching `countPrintPendingLetters`'s own doc
 * comment: "excludes already-printed letters, even if their complaint hasn't
 * been filed yet") against the real function, not a copy of it.
 */

type FakeRow = Record<string, unknown>;

function makeQueryBuilder(result: { data: FakeRow[] | null; error?: unknown }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {
    select: (...args: unknown[]) => (calls.push({ method: "select", args }), builder),
    eq: (...args: unknown[]) => (calls.push({ method: "eq", args }), builder),
    order: (...args: unknown[]) => (calls.push({ method: "order", args }), builder),
    limit: (...args: unknown[]) => (calls.push({ method: "limit", args }), builder),
    in: (...args: unknown[]) => (calls.push({ method: "in", args }), builder),
    then: (resolve: (v: typeof result) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
    __calls: calls,
  };
  return builder;
}

const letterDraftsResult = { data: null as FakeRow[] | null };
const complaintDocumentsResult = { data: [] as FakeRow[] };
let letterDraftsBuilder: ReturnType<typeof makeQueryBuilder>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table === "letter_drafts") return letterDraftsBuilder;
      if (table === "complaint_documents") return makeQueryBuilder(complaintDocumentsResult);
      throw new Error(`unexpected table in test: ${table}`);
    },
  })),
}));

describe("listPrintQueueLetters (real function, not a copy)", () => {
  beforeEach(() => {
    complaintDocumentsResult.data = [];
  });

  it("returns a never-printed letter regardless of its complaint's status", async () => {
    letterDraftsBuilder = makeQueryBuilder({
      data: [
        { id: "l1", complaint_id: "c1", print_status: "pending", created_at: "2026-01-01", complaint: { status: "Filed" } },
      ],
    });
    const { listPrintQueueLetters } = await import("@/lib/queries");
    const rows = await listPrintQueueLetters();
    expect(rows.map((r) => r.id)).toEqual(["l1"]);
  });

  it("excludes a printed letter even if its complaint is still Draft (current, intentional rule)", async () => {
    letterDraftsBuilder = makeQueryBuilder({
      data: [
        { id: "l1", complaint_id: "c1", print_status: "pending", created_at: "2026-01-01", complaint: { status: "Filed" } },
        { id: "l2", complaint_id: "c2", print_status: "printed", created_at: "2026-01-02", complaint: { status: "Draft" } },
      ],
    });
    const { listPrintQueueLetters } = await import("@/lib/queries");
    const rows = await listPrintQueueLetters();
    expect(rows.map((r) => r.id)).toEqual(["l1"]);
  });

  it("excludes an orphaned printed letter (complaint deleted) rather than resurrecting it", async () => {
    letterDraftsBuilder = makeQueryBuilder({
      data: [{ id: "l1", complaint_id: null, print_status: "printed", created_at: "2026-01-01", complaint: null }],
    });
    const { listPrintQueueLetters } = await import("@/lib/queries");
    const rows = await listPrintQueueLetters();
    expect(rows).toEqual([]);
  });

  it("filters at the DB layer via print_status = pending", async () => {
    letterDraftsBuilder = makeQueryBuilder({ data: [] });
    const { listPrintQueueLetters } = await import("@/lib/queries");
    await listPrintQueueLetters();
    const eqCalls = (letterDraftsBuilder.__calls as { method: string; args: unknown[] }[]).filter((c) => c.method === "eq");
    expect(eqCalls).toContainEqual({ method: "eq", args: ["print_status", "pending"] });
  });
});
