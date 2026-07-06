/**
 * Working-day math for the escalation ladder (pure, framework-free, UTC-midnight
 * — mirrors lib/rti-deadlines.ts's date-handling convention). Sunday is always
 * excluded; Saturday is excluded too only when the admin opts in via
 * ComplaintSettings.excludeSaturdaysAsWorkingDay (most BBMP offices are open most
 * Saturdays, so that's off by default).
 */

export interface WorkingDayOptions {
  excludeSaturdays?: boolean;
}

/** True if `date` (any Date) is a working day under the given rule. */
export function isWorkingDay(date: Date, opts: WorkingDayOptions = {}): boolean {
  const day = date.getUTCDay(); // 0 = Sunday, 6 = Saturday
  if (day === 0) return false;
  if (opts.excludeSaturdays && day === 6) return false;
  return true;
}

/**
 * Add `n` working days to `base`, preserving its time-of-day. Walks forward
 * one calendar day at a time, only counting days that pass isWorkingDay — fine
 * at this scale (escalation SLAs are single-digit day counts).
 */
export function addWorkingDays(base: Date | string, n: number, opts: WorkingDayOptions = {}): Date {
  const start = base instanceof Date ? base : new Date(base);
  const out = new Date(start.getTime());
  let remaining = Math.max(0, Math.trunc(n));
  while (remaining > 0) {
    out.setUTCDate(out.getUTCDate() + 1);
    if (isWorkingDay(out, opts)) remaining--;
  }
  return out;
}
