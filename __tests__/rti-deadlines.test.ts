import { describe, it, expect } from "vitest";
import {
  computeRtiDeadlines,
  deadlineStatus,
  activeDeadline,
  addDays,
  daysBetween,
} from "@/lib/rti-deadlines";
import { DEFAULT_DEADLINE_RULES, type DeadlineRules } from "@/lib/constants";

describe("date helpers", () => {
  it("adds days timezone-safely", () => {
    expect(addDays("2026-01-01", 30)).toBe("2026-01-31");
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01"); // 2026 not a leap year
  });

  it("counts whole days between dates", () => {
    expect(daysBetween("2026-06-14", "2026-06-24")).toBe(10);
    expect(daysBetween("2026-06-24", "2026-06-14")).toBe(-10);
    expect(daysBetween("2026-06-14", "2026-06-14")).toBe(0);
  });
});

describe("computeRtiDeadlines", () => {
  it("computes the normal 30-day reply deadline from receipt", () => {
    const d = computeRtiDeadlines({ dateReceived: "2026-01-01" });
    expect(daysBetween("2026-01-01", d.normalDue!)).toBe(30);
  });

  it("falls back to the filing date when receipt is unknown", () => {
    const d = computeRtiDeadlines({ dateFiled: "2026-01-01" });
    expect(daysBetween("2026-01-01", d.normalDue!)).toBe(30);
  });

  it("computes the 48-hour life/liberty deadline only when flagged", () => {
    const off = computeRtiDeadlines({ dateReceived: "2026-01-01" });
    expect(off.lifeLibertyDue).toBeNull();
    const on = computeRtiDeadlines({ dateReceived: "2026-01-01", isLifeLiberty: true });
    expect(daysBetween("2026-01-01", on.lifeLibertyDue!)).toBe(2); // 48h = 2 days
  });

  it("first appeal is 30 days from an unsatisfactory reply", () => {
    const d = computeRtiDeadlines({ dateReceived: "2026-01-01", replyDate: "2026-02-15" });
    expect(daysBetween("2026-02-15", d.firstAppealDue!)).toBe(30);
  });

  it("first appeal is 30 days from the response-window expiry when no reply", () => {
    const d = computeRtiDeadlines({ dateReceived: "2026-01-01" });
    expect(daysBetween(d.normalDue!, d.firstAppealDue!)).toBe(30);
  });

  it("second appeal is 15 days from the FAA decision date", () => {
    const d = computeRtiDeadlines({
      dateReceived: "2026-01-01",
      firstAppealDecisionDate: "2026-03-01",
    });
    expect(daysBetween("2026-03-01", d.secondAppealDue!)).toBe(15);
  });

  it("returns null deadlines when no base date is available", () => {
    const d = computeRtiDeadlines({});
    expect(d.normalDue).toBeNull();
    expect(d.firstAppealDue).toBeNull();
    expect(d.secondAppealDue).toBeNull();
  });

  it("honours configurable rule overrides", () => {
    const rules: DeadlineRules = { ...DEFAULT_DEADLINE_RULES, normalDays: 45, secondAppealDays: 120 };
    const d = computeRtiDeadlines(
      { dateReceived: "2026-01-01", firstAppealDecisionDate: "2026-03-01" },
      rules,
    );
    expect(daysBetween("2026-01-01", d.normalDue!)).toBe(45);
    expect(daysBetween("2026-03-01", d.secondAppealDue!)).toBe(120);
  });
});

describe("deadlineStatus buckets", () => {
  const today = "2026-06-14";
  it("buckets a due date relative to today", () => {
    expect(deadlineStatus(addDays(today, 20), today)).toBe("due-10plus");
    expect(deadlineStatus(addDays(today, 5), today)).toBe("due-soon");
    expect(deadlineStatus(today, today)).toBe("due-today");
    expect(deadlineStatus(addDays(today, -3), today)).toBe("overdue");
    expect(deadlineStatus(addDays(today, -10), today)).toBe("critical-overdue");
  });

  it("returns null for a missing due date", () => {
    expect(deadlineStatus(null, today)).toBeNull();
  });

  it("respects a configurable dueSoon threshold", () => {
    const rules: DeadlineRules = { ...DEFAULT_DEADLINE_RULES, dueSoonDays: 3 };
    expect(deadlineStatus(addDays(today, 5), today, rules)).toBe("due-10plus");
    expect(deadlineStatus(addDays(today, 2), today, rules)).toBe("due-soon");
  });
});

describe("activeDeadline", () => {
  const today = "2026-06-14";

  it("uses the reply deadline while awaiting reply", () => {
    const a = activeDeadline(
      { status: "Awaiting Reply", normal_due: addDays(today, 5) },
      today,
    );
    expect(a?.label).toBe("Reply");
    expect(a?.bucket).toBe("due-soon");
  });

  it("prefers the life/liberty deadline when flagged", () => {
    const a = activeDeadline(
      {
        status: "Awaiting Reply",
        is_life_liberty: true,
        life_liberty_due: addDays(today, 1),
        normal_due: addDays(today, 25),
      },
      today,
    );
    expect(a?.label).toBe("Life/liberty reply");
  });

  it("switches to the first-appeal deadline after a reply", () => {
    const a = activeDeadline(
      { status: "Reply Received", first_appeal_due: addDays(today, 12) },
      today,
    );
    expect(a?.label).toBe("First appeal");
  });

  it("switches to the first-appeal decision deadline after a first appeal is filed", () => {
    const a = activeDeadline(
      { status: "First Appeal Filed", first_appeal_due: today },
      today,
    );
    expect(a?.label).toBe("First appeal decision");
  });

  it("switches to the second-appeal deadline after an FAA order is received", () => {
    const a = activeDeadline(
      { status: "FAA Order Received", second_appeal_due: addDays(today, 10) },
      today,
    );
    expect(a?.label).toBe("Second appeal");
  });

  it("returns null for closed RTIs", () => {
    expect(activeDeadline({ status: "Closed", normal_due: today }, today)).toBeNull();
  });
});
