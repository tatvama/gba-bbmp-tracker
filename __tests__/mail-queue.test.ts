import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The double-send guard: the embedded Submit-step panel lets a user send a
 * letter manually, and moments later "Mark as filed" fires the SAME automatic
 * path. Without a guard that is a genuine double-send — two independent
 * triggers for the identical (complaint, letter kind), not merely a same-instant
 * race (which the existing in-flight "reused" dedupe already covers).
 */

interface Recorded {
  table: string;
  op: "select" | "insert";
  payload?: unknown;
}

/** A single already-sent row, or null. Filters are genuinely applied (not a
 *  passthrough) so a test asserting "scoped by X" actually proves it — a mock
 *  that ignores .eq() the way an earlier version of __tests__/mail-send.test.ts
 *  once did would let a missing WHERE clause pass silently. */
let alreadySentRow: { complaint_id: string; letter_kind: string; status: string; to_addresses: string[] | null; redirected: boolean } | null = null;
let recorded: Recorded[] = [];

vi.mock("@/lib/db", () => ({
  createAdminClient: () => ({
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return chain;
        },
        limit: () => chain,
        maybeSingle: async () => {
          if (table !== "letter_emails" || !alreadySentRow) return { data: null, error: null };
          const matches = Object.entries(filters).every(
            ([col, val]) => (alreadySentRow as Record<string, unknown>)[col] === val,
          );
          return { data: matches ? alreadySentRow : null, error: null };
        },
        insert: (payload: unknown) => {
          recorded.push({ table, op: "insert", payload });
          return { then: (resolve: (v: unknown) => void) => resolve(undefined) };
        },
      });
      return chain;
    },
  }),
}));

const startJob = vi.fn(async () => ({ ok: true, jobId: "job-1" }));
vi.mock("@/lib/jobs/runner", () => ({ startJob }));
vi.mock("@/lib/jobs/handlers", () => ({}));

const { queueLetterEmail } = await import("@/lib/mail/queue");

const insertPayload = () => (recorded.find((r) => r.op === "insert")?.payload ?? {}) as Record<string, unknown>;

beforeEach(() => {
  alreadySentRow = null;
  recorded = [];
  startJob.mockClear();
  startJob.mockResolvedValue({ ok: true, jobId: "job-1" });
});

describe("queueLetterEmail — already-sent guard", () => {
  it("starts the job normally when nothing has been sent yet for this (complaint, letter kind)", async () => {
    const r = await queueLetterEmail({ complaintId: "c1", letterKind: "Complaint letter" }, "user-1");
    expect(startJob).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ ok: true, jobId: "job-1" });
    expect(recorded).toHaveLength(0);
  });

  it("does NOT start a second job when this exact letter kind already shows status=sent", async () => {
    alreadySentRow = { complaint_id: "c1", letter_kind: "Complaint letter", status: "sent", to_addresses: ["officer@bbmp.gov.in"], redirected: false };
    const r = await queueLetterEmail({ complaintId: "c1", letterKind: "Complaint letter" }, "user-1");

    expect(startJob).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: true, reused: true });
  });

  it("records a skipped outbox row explaining the duplicate was suppressed", async () => {
    alreadySentRow = { complaint_id: "c1", letter_kind: "Complaint letter", status: "sent", to_addresses: ["officer@bbmp.gov.in"], redirected: false };
    await queueLetterEmail({ complaintId: "c1", letterKind: "Complaint letter", documentId: "doc-9" }, "user-1");

    const payload = insertPayload();
    expect(payload.status).toBe("skipped");
    expect(payload.mail_mode).toBe("already-sent");
    expect(payload.document_id).toBe("doc-9");
    expect(payload.error).toContain("officer@bbmp.gov.in");
  });

  it("is scoped per letter kind — a sent Complaint letter does not block a Counter-reply for the same complaint", async () => {
    // The mock's .eq() filters genuinely, so this proves the query really keys
    // on letter_kind rather than complaint_id alone.
    alreadySentRow = { complaint_id: "c1", letter_kind: "Complaint letter", status: "sent", to_addresses: ["x@bbmp.gov.in"], redirected: false };
    const r = await queueLetterEmail({ complaintId: "c1", letterKind: "Counter-reply" }, "user-1");
    expect(startJob).toHaveBeenCalledTimes(1);
    expect(r.reused).toBeUndefined();
  });

  it("is scoped per complaint — a sent letter for a different complaint does not block this one", async () => {
    alreadySentRow = { complaint_id: "c-other", letter_kind: "Complaint letter", status: "sent", to_addresses: ["x@bbmp.gov.in"], redirected: false };
    const r = await queueLetterEmail({ complaintId: "c1", letterKind: "Complaint letter" }, "user-1");
    expect(startJob).toHaveBeenCalledTimes(1);
    expect(r.reused).toBeUndefined();
  });

  it("does not treat a prior FAILED or SKIPPED attempt as already-sent — a real retry must still be possible", async () => {
    // .eq("status", "sent") means a row with any other status simply never
    // matches the filter — the mock enforces that genuinely.
    alreadySentRow = { complaint_id: "c1", letter_kind: "Complaint letter", status: "failed", to_addresses: [], redirected: false };
    const r = await queueLetterEmail({ complaintId: "c1", letterKind: "Complaint letter" }, "user-1");
    expect(startJob).toHaveBeenCalledTimes(1);
    expect(r.reused).toBeUndefined();
  });
});
