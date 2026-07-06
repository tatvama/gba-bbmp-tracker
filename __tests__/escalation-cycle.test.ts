import { describe, it, expect } from "vitest";
import { draftKindsForConfig, computeStageDeadline, ESCALATION_TERMINAL_DRAFT_KINDS } from "@/lib/complaints/escalation-cycle";

describe("draftKindsForConfig", () => {
  it("returns the single configured draft kind for an ordinary stage", () => {
    expect(
      draftKindsForConfig({ on_elapse_draft_kind: "reminder_letter", on_elapse_next_stage: "reminder_sent" }),
    ).toEqual(["reminder_letter"]);
  });

  it("fans out to all three escalation kinds at the terminal transition", () => {
    expect(
      draftKindsForConfig({ on_elapse_draft_kind: null, on_elapse_next_stage: "escalated" }),
    ).toEqual(ESCALATION_TERMINAL_DRAFT_KINDS);
  });

  it("returns nothing for a stage with neither a draft kind nor an escalated target", () => {
    expect(draftKindsForConfig({ on_elapse_draft_kind: null, on_elapse_next_stage: "closed" })).toEqual([]);
  });
});

describe("computeStageDeadline", () => {
  it("adds calendar days for a calendar-unit SLA", () => {
    const d = computeStageDeadline(new Date("2026-07-06T09:00:00Z"), { sla_days: 14, sla_unit: "calendar" });
    expect(d?.toISOString().slice(0, 10)).toBe("2026-07-20");
  });

  it("adds working days (Sundays skipped) for a working-unit SLA", () => {
    const d = computeStageDeadline(new Date("2026-07-06T09:00:00Z"), { sla_days: 7, sla_unit: "working" });
    expect(d?.toISOString().slice(0, 10)).toBe("2026-07-14");
  });

  it("returns null when the stage has no SLA (terminal stage)", () => {
    expect(computeStageDeadline(new Date(), { sla_days: null, sla_unit: null })).toBeNull();
  });
});
