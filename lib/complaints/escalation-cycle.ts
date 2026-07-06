/**
 * Escalation ladder — pure types + stage-transition logic (no I/O, unit-tested).
 * The DB-touching orchestration lives in escalation-scheduler.ts, which reads
 * escalation_flow_configs (migration 0031) and calls into these pure helpers.
 */
import type { ComplaintDraftKind } from "@/lib/constants";
import { addWorkingDays, type WorkingDayOptions } from "@/lib/complaints/working-days";

export type EscalationStage =
  | "awaiting_ack"
  | "awaiting_reply"
  | "reminder_sent"
  | "legal_notice_sent"
  | "escalated"
  | "replied"
  | "closed";

/** The stages the scheduler actively watches a deadline for. */
export const ACTIVE_LADDER_STAGES: EscalationStage[] = ["awaiting_reply", "reminder_sent", "legal_notice_sent"];

export type CycleEvent =
  | "ack_uploaded"
  | "reminder_sent"
  | "legal_notice_sent"
  | "escalated"
  | "reply_received"
  | "counter_reply_filed";

export interface EscalationFlowConfigRow {
  stage_key: string;
  sla_days: number | null;
  sla_unit: "calendar" | "working" | null;
  on_elapse_draft_kind: string | null;
  on_elapse_next_stage: string;
}

/** Escalation letters fired together at the terminal legal_notice_sent ->
 * escalated transition — no single on_elapse_draft_kind because the human
 * picks which of the three to actually send. */
export const ESCALATION_TERMINAL_DRAFT_KINDS: ComplaintDraftKind[] = [
  "lokayukta_complaint",
  "chief_secretary_letter",
  "cm_office_letter",
];

/** Which draft kind(s) to auto-generate when a stage's SLA elapses. */
export function draftKindsForConfig(
  config: Pick<EscalationFlowConfigRow, "on_elapse_draft_kind" | "on_elapse_next_stage">,
): ComplaintDraftKind[] {
  if (config.on_elapse_draft_kind) return [config.on_elapse_draft_kind as ComplaintDraftKind];
  if (config.on_elapse_next_stage === "escalated") return ESCALATION_TERMINAL_DRAFT_KINDS;
  return [];
}

/**
 * The deadline for the stage a complaint is ENTERING, computed once (not
 * recomputed from scratch each sweep). Null when the config has no SLA (a
 * terminal stage like 'escalated').
 */
export function computeStageDeadline(
  enteredAt: Date,
  config: Pick<EscalationFlowConfigRow, "sla_days" | "sla_unit">,
  opts: WorkingDayOptions = {},
): Date | null {
  if (!config.sla_days || !config.sla_unit) return null;
  if (config.sla_unit === "working") return addWorkingDays(enteredAt, config.sla_days, opts);
  const out = new Date(enteredAt.getTime());
  out.setUTCDate(out.getUTCDate() + config.sla_days);
  return out;
}
