/**
 * RTI deadline engine (pure, framework-free, fully unit-testable).
 *
 * Statutory basis (RTI Act 2005), all values CONFIGURABLE via app_settings so the
 * rules can change without code edits:
 *   - Normal response:  30 days from receipt.
 *   - Life/liberty:      48 hours from receipt.
 *   - First appeal:      30 days from expiry of the response period OR from receipt
 *                        of an unsatisfactory reply.
 *   - Second appeal:     90 days from the FAA decision date (or the date by which it
 *                        should have been made).
 *   - FAA disposal:      30 days, extendable to 45 with reasons (tracked, not a due).
 */
import {
  DEFAULT_DEADLINE_RULES,
  type DeadlineRules,
  type DeadlineBucket,
} from "./constants";

// ── date-only helpers (UTC midnight, timezone-safe) ─────────────────────────

/** Parse 'YYYY-MM-DD' (or any Date-parseable string) to a UTC-midnight Date, or null. */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Format a Date as 'YYYY-MM-DD' (UTC). */
export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(value: string | Date | null | undefined, days: number): string | null {
  const base = value instanceof Date ? value : parseDate(value);
  if (!base) return null;
  const out = new Date(base.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return toISODate(out);
}

/** Whole days from `from` to `to` (positive => `to` is in the future of `from`). */
export function daysBetween(from: string | Date, to: string | Date): number {
  const a = from instanceof Date ? from : parseDate(from);
  const b = to instanceof Date ? to : parseDate(to);
  if (!a || !b) return 0;
  const aMid = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bMid = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((bMid - aMid) / 86_400_000);
}

// ── deadline computation ────────────────────────────────────────────────────

export interface DeadlineInput {
  /** Date the authority received the application (preferred base). */
  dateReceived?: string | null;
  /** Fallback base if receipt date is unknown. */
  dateFiled?: string | null;
  isLifeLiberty?: boolean;
  /** Date an (unsatisfactory) reply was received — starts the first-appeal clock. */
  replyDate?: string | null;
  /** FAA decision date — starts the second-appeal clock. */
  firstAppealDecisionDate?: string | null;
}

export interface ComputedDeadlines {
  normalDue: string | null;
  lifeLibertyDue: string | null;
  firstAppealDue: string | null;
  secondAppealDue: string | null;
}

/**
 * Compute the four statutory due dates from the available facts. Missing inputs
 * yield null for the dependent deadlines (never a guessed date).
 */
export function computeRtiDeadlines(
  input: DeadlineInput,
  rules: DeadlineRules = DEFAULT_DEADLINE_RULES,
): ComputedDeadlines {
  const base = input.dateReceived ?? input.dateFiled ?? null;

  const normalDue = base ? addDays(base, rules.normalDays) : null;
  const lifeLibertyDue =
    base && input.isLifeLiberty
      ? addDays(base, Math.ceil(rules.lifeLibertyHours / 24))
      : null;

  // First appeal: 30 days from receipt of unsatisfactory reply, else from expiry
  // of the normal response window.
  const firstAppealBase = input.replyDate ?? normalDue;
  const firstAppealDue = firstAppealBase
    ? addDays(firstAppealBase, rules.firstAppealDays)
    : null;

  // Second appeal: 90 days from the FAA decision (or the date it should have been
  // made — approximated by the first-appeal due when no decision date exists).
  const secondAppealBase = input.firstAppealDecisionDate ?? firstAppealDue;
  const secondAppealDue = secondAppealBase
    ? addDays(secondAppealBase, rules.secondAppealDays)
    : null;

  return { normalDue, lifeLibertyDue, firstAppealDue, secondAppealDue };
}

// ── status / countdown ──────────────────────────────────────────────────────

/**
 * Bucket a due date relative to `today` for the countdown badge.
 * Returns null when there is no due date.
 */
export function deadlineStatus(
  due: string | null | undefined,
  today: string | Date = new Date(),
  rules: DeadlineRules = DEFAULT_DEADLINE_RULES,
): DeadlineBucket | null {
  if (!due) return null;
  const diff = daysBetween(today, due); // >0 future, 0 today, <0 past
  if (diff < 0) {
    return -diff > rules.criticalOverdueDays ? "critical-overdue" : "overdue";
  }
  if (diff === 0) return "due-today";
  if (diff <= rules.dueSoonDays) return "due-soon";
  return "due-10plus";
}

export const DEADLINE_BUCKET_LABEL: Record<DeadlineBucket, string> = {
  "due-10plus": "On track",
  "due-soon": "Due soon",
  "due-today": "Due today",
  overdue: "Overdue",
  "critical-overdue": "Critical overdue",
};

// ── which deadline matters now ──────────────────────────────────────────────

export interface RtiDeadlineFields {
  status?: string | null;
  is_life_liberty?: boolean | null;
  normal_due?: string | null;
  life_liberty_due?: string | null;
  first_appeal_due?: string | null;
  second_appeal_due?: string | null;
  first_appeal_filed_date?: string | null;
}

export interface ActiveDeadline {
  label: string;
  due: string;
  bucket: DeadlineBucket;
}

/**
 * Pick the single deadline that matters for an RTI given its current status, and
 * bucket it. Returns null for terminal/no-deadline states.
 */
export function activeDeadline(
  rti: RtiDeadlineFields,
  today: string | Date = new Date(),
  rules: DeadlineRules = DEFAULT_DEADLINE_RULES,
): ActiveDeadline | null {
  const status = rti.status ?? "";
  if (status === "Closed") return null;

  let label: string;
  let due: string | null | undefined;

  if (status === "First Appeal Filed") {
    label = "First appeal decision";
    due = rti.first_appeal_filed_date
      ? addDays(rti.first_appeal_filed_date, rules.faaDisposalDays)
      : addDays(rti.first_appeal_due, rules.faaDisposalDays);
  } else if (status === "FAA Order Received" || status === "Second Appeal Drafted") {
    label = "Second appeal";
    due = rti.second_appeal_due;
  } else if (status === "Second Appeal Filed" || status === "Complaint Filed") {
    return null;
  } else if (
    status === "Reply Received" ||
    status === "Partial Reply" ||
    status === "Rejected" ||
    status === "No Reply" ||
    status === "First Appeal Drafted"
  ) {
    label = "First appeal";
    due = rti.first_appeal_due;
  } else {
    // Draft / Ready to File / Filed / Awaiting Reply
    if (rti.is_life_liberty && rti.life_liberty_due) {
      label = "Life/liberty reply";
      due = rti.life_liberty_due;
    } else {
      label = "Reply";
      due = rti.normal_due;
    }
  }

  const bucket = deadlineStatus(due, today, rules);
  if (!due || !bucket) return null;
  return { label, due, bucket };
}
