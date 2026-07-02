import { describe, it, expect } from "vitest";
import { reconcileAction } from "@/lib/ai/advisor/action-reconcile";

/**
 * The AI owns the primary-action decision when it ran and returned a valid
 * enum value; otherwise the deterministic date-math action wins, so the advisor
 * still gives a sane answer with no AI key or on a hallucinated value. Pure fn,
 * no mocks (mirrors __tests__/print-queue.test.ts).
 */
describe("reconcileAction", () => {
  it("uses the AI's action when the pass ran and returned a valid enum value", () => {
    expect(reconcileAction("escalate", "wait", true)).toBe("escalate");
    expect(reconcileAction("request_clarification", "counter_reply", true)).toBe("request_clarification");
    expect(reconcileAction("close", "wait", true)).toBe("close");
  });

  it("falls back to the deterministic action when the AI pass did not run", () => {
    expect(reconcileAction("escalate", "generate_reminder", false)).toBe("generate_reminder");
    expect(reconcileAction("close", "wait", false)).toBe("wait");
  });

  it("falls back when the AI returned an out-of-enum / hallucinated value", () => {
    expect(reconcileAction("nuke_from_orbit", "counter_reply", true)).toBe("counter_reply");
    expect(reconcileAction("", "wait", true)).toBe("wait");
    expect(reconcileAction(null, "escalate", true)).toBe("escalate");
    expect(reconcileAction(undefined, "wait", true)).toBe("wait");
  });

  it("accepts the new request_clarification action as valid", () => {
    // Guards against the enum and the DB CHECK drifting apart.
    expect(reconcileAction("request_clarification", "wait", true)).toBe("request_clarification");
  });
});
