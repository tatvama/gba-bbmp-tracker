import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { gatherReplyGapInputs } from "@/lib/actions/lifecycle";
import { analyzeReplyGap, type ReplyGap } from "@/lib/ai/reply-gap-analyzer";
import type { RecommendationAction } from "./types";

export interface ReplyEvaluation {
  hasReply: boolean;
  gap: ReplyGap | null;
  suggestedAction: RecommendationAction;
}

/**
 * Thin wrapper around the existing reply-gap analyzer (lib/ai/reply-gap-analyzer.ts
 * + lib/actions/lifecycle.ts's gatherReplyGapInputs) — no new AI logic. Maps the
 * gap result into one of the advisor's recommendation actions.
 */
export async function evaluateReply(admin: SupabaseClient, complaintId: string): Promise<ReplyEvaluation> {
  const { demands, replyText, complaintFound } = await gatherReplyGapInputs(admin, complaintId);
  if (!complaintFound || !replyText) {
    return { hasReply: false, gap: null, suggestedAction: "none" };
  }

  const r = await analyzeReplyGap({ demands, replyText });
  if (!r.ok || !r.data) {
    // AI unavailable or failed — we know a reply exists but can't judge it yet.
    return { hasReply: true, gap: null, suggestedAction: "review" };
  }

  const gap = r.data;
  let suggestedAction: RecommendationAction;
  if (gap.escalationRecommended) suggestedAction = "escalate";
  else if (gap.unaddressedCount > 0) suggestedAction = "counter_reply";
  else suggestedAction = "close";

  return { hasReply: true, gap, suggestedAction };
}
