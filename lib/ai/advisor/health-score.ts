import { daysBetween } from "@/lib/rti-deadlines";
import type { AdvisorContext, RecommendationRow } from "./types";

/**
 * Deterministic, synchronous, no I/O — never calls the AI provider. Always
 * cheap to compute, so it's kept fresh on every trigger even when the AI
 * narrative call is skipped by the context-hash cache.
 */
export interface HealthScoreResult {
  healthScore: number;
  riskLevel: RecommendationRow["risk_level"];
  riskFactors: string[];
}

const TERMINAL_STATUSES = new Set(["Resolved", "Closed"]);

export function computeHealthScore(ctx: AdvisorContext): HealthScoreResult {
  const { complaint, today } = ctx;
  const riskFactors: string[] = [];

  if (TERMINAL_STATUSES.has(complaint.status)) {
    // A closed/resolved case is healthy by definition — there's nothing left
    // to chase — unless it was reopened afterwards (reopenedCount already
    // reflects that via the timeline, but the CURRENT status here is terminal
    // so we don't need to consult it separately).
    return { healthScore: 100, riskLevel: "Low", riskFactors: [] };
  }

  let score = 100;

  // Overdue follow-up, tiered.
  const overdueDays = complaint.next_follow_up_date
    ? -daysBetween(today, complaint.next_follow_up_date) // positive when follow-up date is in the past
    : 0;
  if (overdueDays > 0) {
    if (overdueDays >= 21) { score -= 35; riskFactors.push(`${overdueDays} days overdue for follow-up`); }
    else if (overdueDays >= 10) { score -= 22; riskFactors.push(`${overdueDays} days overdue for follow-up`); }
    else if (overdueDays >= 3) { score -= 12; riskFactors.push(`${overdueDays} days overdue for follow-up`); }
    else { score -= 5; riskFactors.push(`${overdueDays} day(s) overdue for follow-up`); }
  }

  // No reply at all since filing.
  if (!complaint.latest_reply_date && complaint.date_submitted) {
    const daysSinceFiled = daysBetween(complaint.date_submitted, today);
    if (daysSinceFiled >= 15) { score -= 20; riskFactors.push(`No reply ${daysSinceFiled} days after filing`); }
    else if (daysSinceFiled >= 7) { score -= 8; riskFactors.push(`No reply ${daysSinceFiled} days after filing`); }
  }

  // Escalation already in progress — inherently higher-risk case.
  if (complaint.escalation_level || complaint.status === "Escalated") {
    score -= 15;
    riskFactors.push(`Escalated${complaint.escalation_level ? ` to ${complaint.escalation_level}` : ""}`);
  }

  // Reopened history — a case that keeps bouncing back is unhealthy.
  if (ctx.reopenedCount > 0) {
    score -= Math.min(20, ctx.reopenedCount * 10);
    riskFactors.push(`Reopened ${ctx.reopenedCount} time(s)`);
  }

  // Explicitly unsatisfactory replies on record.
  const unsatisfactoryReplies = ctx.replies.filter((r) => r.is_satisfactory === false).length;
  if (unsatisfactoryReplies > 0) {
    score -= 10;
    riskFactors.push(`${unsatisfactoryReplies} reply/replies marked unsatisfactory`);
  }

  // Pending reminders already overdue.
  const overdueReminders = ctx.reminders.filter(
    (r) => r.status === "Pending" && r.due_date && r.due_date < today,
  ).length;
  if (overdueReminders > 0) {
    score -= 8;
    riskFactors.push(`${overdueReminders} overdue reminder(s)`);
  }

  // Documents needing manual review/correction.
  const docsNeedingReview = ctx.documents.filter((d) =>
    ["Pending Review", "Needs Correction", "Low Confidence"].includes(d.verification_status),
  ).length;
  if (docsNeedingReview > 0) {
    score -= 6;
    riskFactors.push(`${docsNeedingReview} document(s) need review`);
  }

  // Photo/document intelligence (reuses the existing forensic dedupe + vision
  // pipeline's already-computed flags on complaint_documents — no new AI call).
  const duplicatePhotos = ctx.documents.filter((d) => d.is_duplicate).length;
  if (duplicatePhotos > 0) {
    const severe = ctx.documents.some((d) => d.is_duplicate && d.dup_severity === "High");
    score -= severe ? 15 : 8;
    riskFactors.push(`${duplicatePhotos} photo(s) flagged as duplicates — verify originals`);
  }
  const visionFlagged = ctx.documents.filter((d) => d.vision_verdict && d.vision_verdict !== "ok").length;
  if (visionFlagged > 0) {
    score -= 8;
    riskFactors.push(`${visionFlagged} photo(s) flagged by AI vision review`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let riskLevel: RecommendationRow["risk_level"];
  if (score >= 75) riskLevel = "Low";
  else if (score >= 50) riskLevel = "Medium";
  else if (score >= 25) riskLevel = "High";
  else riskLevel = "Critical";

  return { healthScore: score, riskLevel, riskFactors };
}
