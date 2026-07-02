import "server-only";
import { createHash } from "crypto";
import type { AdvisorContext } from "./types";

/**
 * SHA-256 over only the fields that could change the AI's answer — status,
 * dates, escalation level, assignees, and counts/last-ids of related records.
 * Deliberately excludes cosmetic fields (notes, landmark text) so a no-op
 * edit doesn't bust the cache and trigger a redundant Claude call.
 */
export function computeContextHash(ctx: AdvisorContext): string {
  const { complaint } = ctx;
  const lastId = <T extends { id: string }>(rows: T[]): string | null => rows[rows.length - 1]?.id ?? null;

  const signal = {
    status: complaint.status,
    priority: complaint.priority,
    nextFollowUpDate: complaint.next_follow_up_date,
    latestReplyDate: complaint.latest_reply_date,
    latestActionTakenDate: complaint.latest_action_taken_date,
    escalationLevel: complaint.escalation_level,
    assignedEngineerId: complaint.assigned_engineer_id,
    assignedOfficerId: complaint.assigned_officer_id,
    closureDate: complaint.closure_date,
    timeline: { count: ctx.timeline.length, lastId: lastId(ctx.timeline) },
    replies: { count: ctx.replies.length, lastId: lastId(ctx.replies) },
    actions: { count: ctx.actions.length, lastId: lastId(ctx.actions) },
    escalations: { count: ctx.escalations.length, lastId: lastId(ctx.escalations) },
    documents: { count: ctx.documents.length, lastId: lastId(ctx.documents) },
    reminders: {
      count: ctx.reminders.length,
      pending: ctx.reminders.filter((r) => r.status === "Pending").length,
    },
  };

  return createHash("sha256").update(JSON.stringify(signal)).digest("hex");
}
