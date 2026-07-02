import { describe, it, expect } from "vitest";

/**
 * Pure membership rule for the print queue (mirrors the .filter(...) at the
 * end of lib/queries.ts#listPrintQueueLetters — kept here as a plain function
 * so it's unit-testable without a request-scoped Supabase client):
 *
 *   - never-printed ('pending') letters ALWAYS stay visible — printing is
 *     mandatory groundwork regardless of what the complaint's status is.
 *   - a 'printed' letter drops out of the queue once its complaint has
 *     actually moved past Draft (fileComplaint was called) — the cycle
 *     continued past the print step.
 *   - an orphaned letter (no linked complaint, e.g. after a complaint was
 *     deleted) stays visible rather than silently vanishing.
 */
function inPrintQueue(l: { printStatus: "pending" | "printed"; complaintStatus: string | null; complaintId: string | null }): boolean {
  return l.printStatus === "pending" || l.complaintStatus === "Draft" || !l.complaintId;
}

describe("print-queue membership rule", () => {
  it("keeps a never-printed letter regardless of complaint status", () => {
    expect(inPrintQueue({ printStatus: "pending", complaintStatus: "Draft", complaintId: "c1" })).toBe(true);
    expect(inPrintQueue({ printStatus: "pending", complaintStatus: "Filed", complaintId: "c1" })).toBe(true);
    expect(inPrintQueue({ printStatus: "pending", complaintStatus: "Resolved", complaintId: "c1" })).toBe(true);
  });

  it("keeps a printed letter only while its complaint is still Draft", () => {
    expect(inPrintQueue({ printStatus: "printed", complaintStatus: "Draft", complaintId: "c1" })).toBe(true);
    expect(inPrintQueue({ printStatus: "printed", complaintStatus: "Filed", complaintId: "c1" })).toBe(false);
    expect(inPrintQueue({ printStatus: "printed", complaintStatus: "Resolved", complaintId: "c1" })).toBe(false);
  });

  it("keeps an orphaned printed letter (complaint deleted) rather than hiding it", () => {
    expect(inPrintQueue({ printStatus: "printed", complaintStatus: null, complaintId: null })).toBe(true);
  });
});
