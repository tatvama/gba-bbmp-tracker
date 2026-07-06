import { describe, it, expect } from "vitest";
import { isWorkingDay, addWorkingDays } from "@/lib/complaints/working-days";

describe("isWorkingDay", () => {
  it("excludes Sunday by default", () => {
    // 2026-07-05 is a Sunday.
    expect(isWorkingDay(new Date("2026-07-05T00:00:00Z"))).toBe(false);
  });

  it("treats Saturday as a working day by default", () => {
    // 2026-07-04 is a Saturday.
    expect(isWorkingDay(new Date("2026-07-04T00:00:00Z"))).toBe(true);
  });

  it("excludes Saturday only when opted in", () => {
    expect(isWorkingDay(new Date("2026-07-04T00:00:00Z"), { excludeSaturdays: true })).toBe(false);
  });

  it("treats weekdays as working days regardless of options", () => {
    // 2026-07-06 is a Monday.
    expect(isWorkingDay(new Date("2026-07-06T00:00:00Z"))).toBe(true);
    expect(isWorkingDay(new Date("2026-07-06T00:00:00Z"), { excludeSaturdays: true })).toBe(true);
  });
});

describe("addWorkingDays", () => {
  it("skips only Sundays by default", () => {
    // Mon 2026-07-06 + 7 working days: Tue..Sat (5) + skip Sun 07-12 + Mon 07-13, Tue 07-14 = 7th working day.
    const out = addWorkingDays("2026-07-06T09:00:00Z", 7);
    expect(out.toISOString().slice(0, 10)).toBe("2026-07-14");
  });

  it("skips both Sat and Sun when excludeSaturdays is set", () => {
    const out = addWorkingDays("2026-07-06T09:00:00Z", 7, { excludeSaturdays: true });
    // Mon 07-06 + 7 working days skipping every Sat/Sun -> Wed 2026-07-15.
    expect(out.toISOString().slice(0, 10)).toBe("2026-07-15");
  });

  it("preserves the time-of-day component", () => {
    const out = addWorkingDays("2026-07-06T09:30:00Z", 1);
    expect(out.getUTCHours()).toBe(9);
    expect(out.getUTCMinutes()).toBe(30);
  });

  it("returns the same instant for n=0", () => {
    const out = addWorkingDays("2026-07-06T09:30:00Z", 0);
    expect(out.toISOString()).toBe("2026-07-06T09:30:00.000Z");
  });
});
