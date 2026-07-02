import { daysBetween } from "@/lib/rti-deadlines";
import type { AdvisorContext } from "./types";

export interface ReminderSuggestion {
  action: "none" | "generate_reminder" | "escalate";
  daysSinceEvent: number;
  reasonLabel: string;
}

const OPEN_REMINDER_TYPES = new Set(["Follow-up with engineer", "Follow-up with ward office"]);

/**
 * Pure date math — no AI, no I/O. Decides whether the advisor should suggest
 * generating a reminder letter or escalating, while preventing duplicates by
 * checking both the cached "last generated" timestamps AND any still-open
 * Pending reminder of the relevant type.
 */
export function evaluateReminderWorkflow(ctx: AdvisorContext): ReminderSuggestion {
  const { complaint, settings, reminders, today } = ctx;
  const prev = ctx.previousRecommendation;

  // A reply has arrived — this workflow no longer applies (reply-agent takes over).
  if (complaint.latest_reply_date) {
    return { action: "none", daysSinceEvent: 0, reasonLabel: "Reply already received" };
  }

  const hasOpenFollowUpReminder = reminders.some(
    (r) => r.status === "Pending" && OPEN_REMINDER_TYPES.has(r.reminder_type ?? ""),
  );

  const lastReminderGeneratedAt = prev?.last_reminder_generated_at ?? null;
  const lastEscalationGeneratedAt = prev?.last_escalation_generated_at ?? null;

  // A reminder was already generated and is still open — check for escalation.
  if (lastReminderGeneratedAt && !lastEscalationGeneratedAt) {
    const daysSinceReminder = daysBetween(lastReminderGeneratedAt.slice(0, 10), today);
    if (daysSinceReminder >= settings.aiAdvisorEscalationSlaDays) {
      return {
        action: "escalate",
        daysSinceEvent: daysSinceReminder,
        reasonLabel: `${daysSinceReminder} days since reminder was generated, still no reply`,
      };
    }
    return {
      action: "none",
      daysSinceEvent: daysSinceReminder,
      reasonLabel: `Reminder generated ${daysSinceReminder} day(s) ago — within the escalation SLA`,
    };
  }

  // A reminder was already generated (and an escalation followed) — nothing
  // further to suggest from this workflow; the escalation itself is tracked
  // via the complaint's status/escalation_level, not repeated here.
  if (lastReminderGeneratedAt && lastEscalationGeneratedAt) {
    return { action: "none", daysSinceEvent: 0, reasonLabel: "Already escalated after a reminder" };
  }

  // No reminder generated yet — check whether the SLA since filing has elapsed.
  const baseDate = complaint.date_submitted ?? null;
  if (!baseDate) {
    return { action: "none", daysSinceEvent: 0, reasonLabel: "Not yet filed" };
  }
  const daysSinceFiling = daysBetween(baseDate, today);
  if (daysSinceFiling >= settings.aiAdvisorReminderSlaDays && !hasOpenFollowUpReminder) {
    return {
      action: "generate_reminder",
      daysSinceEvent: daysSinceFiling,
      reasonLabel: `${daysSinceFiling} days since filing, no reply yet`,
    };
  }
  if (daysSinceFiling >= settings.aiAdvisorReminderSlaDays && hasOpenFollowUpReminder) {
    return {
      action: "none",
      daysSinceEvent: daysSinceFiling,
      reasonLabel: "SLA elapsed but a follow-up reminder is already open",
    };
  }
  return {
    action: "none",
    daysSinceEvent: daysSinceFiling,
    reasonLabel: `${daysSinceFiling} days since filing — within the reminder SLA`,
  };
}
