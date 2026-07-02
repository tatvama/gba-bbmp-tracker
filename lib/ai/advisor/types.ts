import "server-only";
import type {
  ComplaintWithRelations,
  ComplaintTimelineEntry,
  ComplaintReply,
  ComplaintActionTaken,
  ComplaintDocument,
  Reminder,
} from "@/lib/types";
import type { ComplaintSettings } from "@/lib/constants";

/** Row shape of `complaint_ai_recommendations` (one per complaint, upserted). */
export interface RecommendationRow {
  id: string;
  complaint_id: string;
  health_score: number;
  risk_level: "Low" | "Medium" | "High" | "Critical";
  risk_factors: string[];
  current_situation: string | null;
  reasoning: string | null;
  expected_outcome: string | null;
  confidence: "High" | "Medium" | "Low" | null;
  recommendation: string | null;
  recommendation_action: RecommendationAction | null;
  missing_information: string[];
  detected_risks: string[];
  timeline_summary: string | null;
  context_hash: string | null;
  last_analyzed_at: string | null;
  analysis_status: "idle" | "queued" | "running" | "done" | "failed";
  analysis_error: string | null;
  ai_configured_at_analysis: boolean;
  last_reminder_generated_at: string | null;
  last_reminder_draft_id: string | null;
  last_escalation_generated_at: string | null;
  last_escalation_draft_id: string | null;
  created_at: string;
  updated_at: string;
}

export type RecommendationAction =
  | "generate_reminder"
  | "escalate"
  | "counter_reply"
  | "wait"
  | "close"
  | "upload_evidence"
  | "review"
  | "none";

/** Minimal shape of an escalation_logs row (no dedicated type exists yet). */
export interface EscalationLogRow {
  id: string;
  escalated_on: string | null;
  to_level: string | null;
  to_officer: string | null;
  reason: string | null;
  status: string | null;
  response_received: string | null;
}

/** Everything the advisor needs to reason about a complaint's current state. */
export interface AdvisorContext {
  complaint: ComplaintWithRelations;
  timeline: ComplaintTimelineEntry[];
  replies: ComplaintReply[];
  actions: ComplaintActionTaken[];
  escalations: EscalationLogRow[];
  reminders: Reminder[];
  documents: ComplaintDocument[];
  previousRecommendation: RecommendationRow | null;
  settings: ComplaintSettings;
  /** Reopened-status count, derived from the timeline (event_type = 'Reopened' or title match). */
  reopenedCount: number;
  today: string; // YYYY-MM-DD
}
