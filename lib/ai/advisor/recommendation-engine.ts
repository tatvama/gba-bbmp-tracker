import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAiConfigured } from "@/lib/ai/provider";
import { notifyUser } from "@/lib/notifications";
import { buildAdvisorContext } from "./context-builder";
import { computeContextHash } from "./context-hash";
import { computeHealthScore } from "./health-score";
import { evaluateReminderWorkflow } from "./reminder-workflow";
import { evaluateReply } from "./reply-agent";
import { analyzeThread } from "./thread-decision-agent";
import { reconcileAction } from "./action-reconcile";
import { checkEvidenceCompleteness } from "./evidence";
import { gatherReplyGapInputs } from "@/lib/actions/lifecycle";
import type { RecommendationAction } from "./types";

export interface RunAdvisorResult {
  ok: boolean;
  skipped?: "unchanged" | "already-running" | "disabled" | "not-found";
  error?: string;
}

const ACTIONABLE = new Set<RecommendationAction>([
  "generate_reminder",
  "escalate",
  "counter_reply",
  "request_clarification",
  "close",
]);

/**
 * Orchestrator: build context -> single-flight claim -> deterministic health
 * score (always, cheap) -> context-hash cache gate -> reply/reminder decision
 * -> AI narrative -> upsert. Never throws — callers (triggerAdvisorAnalysis's
 * after() callback, the cron sweep) treat this as best-effort.
 */
export async function runAdvisorAnalysis(admin: SupabaseClient, complaintId: string): Promise<RunAdvisorResult> {
  // Ensure a row exists so the atomic claim below has something to touch.
  // ignoreDuplicates means this is a no-op (doesn't clobber existing data) when
  // a row is already there.
  await admin
    .from("complaint_ai_recommendations")
    .upsert({ complaint_id: complaintId }, { onConflict: "complaint_id", ignoreDuplicates: true });

  // Single-flight claim: only proceed if no other run currently owns this row.
  const { data: claimed, error: claimError } = await admin
    .from("complaint_ai_recommendations")
    .update({ analysis_status: "running" })
    .eq("complaint_id", complaintId)
    .neq("analysis_status", "running")
    .select("id")
    .maybeSingle();
  if (claimError) return { ok: false, error: claimError.message };
  if (!claimed) return { ok: true, skipped: "already-running" };

  try {
    const ctx = await buildAdvisorContext(admin, complaintId);
    if (!ctx) {
      await admin.from("complaint_ai_recommendations").update({ analysis_status: "idle" }).eq("complaint_id", complaintId);
      return { ok: false, skipped: "not-found", error: "Complaint not found." };
    }

    const healthScore = computeHealthScore(ctx);

    // Deterministic fields are free — write them immediately regardless of AI
    // availability, so the panel/dashboard never shows a stale score.
    await admin
      .from("complaint_ai_recommendations")
      .update({ health_score: healthScore.healthScore, risk_level: healthScore.riskLevel, risk_factors: healthScore.riskFactors })
      .eq("complaint_id", complaintId);

    if (!ctx.settings.aiAdvisorEnabled) {
      await admin.from("complaint_ai_recommendations").update({ analysis_status: "idle" }).eq("complaint_id", complaintId);
      return { ok: true, skipped: "disabled" };
    }

    // context_hash is only ever written on a successful narrative run (see
    // below), so comparing against it here is safe even though our own claim
    // just overwrote analysis_status on this same row.
    const newHash = computeContextHash(ctx);
    if (ctx.previousRecommendation?.context_hash === newHash) {
      await admin.from("complaint_ai_recommendations").update({ analysis_status: "done" }).eq("complaint_id", complaintId);
      return { ok: true, skipped: "unchanged" };
    }

    // Deterministic signals — still computed, but now they are STRONG HINTS
    // into the AI's full-history reasoning, not the final decision. They also
    // define the fallback action used when AI is unavailable / fails.
    const replyEval = await evaluateReply(admin, complaintId);
    const reminderSuggestion = evaluateReminderWorkflow(ctx);
    const evidenceGaps = checkEvidenceCompleteness(ctx);
    const { demands } = await gatherReplyGapInputs(admin, complaintId);

    let deterministicFallback: RecommendationAction;
    if (replyEval.hasReply) {
      deterministicFallback = replyEval.suggestedAction;
    } else if (reminderSuggestion.action === "generate_reminder") {
      deterministicFallback = "generate_reminder";
    } else if (reminderSuggestion.action === "escalate") {
      deterministicFallback = "escalate";
    } else {
      deterministicFallback = "wait";
    }

    // The deep pass: reason over the WHOLE correspondence (every reply, every
    // letter we sent, documents, prior open state) to decide the action AND
    // track outstanding issues / contradictions / commitments.
    const decision = await analyzeThread({
      context: ctx,
      healthScore,
      demands,
      replyGap: replyEval.gap,
      reminderSuggestion,
      evidenceGaps,
      deterministicFallbackAction: deterministicFallback,
    });

    const action = reconcileAction(decision.data.recommendedAction, deterministicFallback, decision.ok);
    const previousAction = ctx.previousRecommendation?.recommendation_action ?? null;

    // Deterministic evidence-completeness checks are merged with the AI's, so
    // missing evidence is still flagged even when the AI pass is unavailable.
    const missingInformation = Array.from(new Set([...evidenceGaps, ...decision.data.missingInformation]));

    await admin
      .from("complaint_ai_recommendations")
      .update({
        current_situation: decision.data.currentSituation,
        reasoning: decision.data.reasoning,
        expected_outcome: decision.data.expectedOutcome,
        confidence: decision.data.confidenceBand,
        confidence_score: decision.data.confidenceScore,
        recommendation: decision.data.recommendationLabel,
        recommendation_action: action,
        missing_information: missingInformation,
        detected_risks: decision.data.detectedRisks,
        outstanding_issues: decision.data.outstandingIssues,
        contradictions: decision.data.contradictions,
        commitments: decision.data.commitments,
        analyzed_correspondence_count: decision.data.analyzedCount,
        timeline_summary: decision.data.timelineSummary,
        context_hash: newHash,
        last_analyzed_at: new Date().toISOString(),
        analysis_status: "done",
        analysis_error: decision.ok ? null : decision.error ?? null,
        ai_configured_at_analysis: isAiConfigured(),
      })
      .eq("complaint_id", complaintId);

    if (ACTIONABLE.has(action) && action !== previousAction && ctx.complaint.created_by) {
      await notifyUser(admin, ctx.complaint.created_by, {
        type: "info",
        title: `AI Advisor: ${decision.data.recommendationLabel}`,
        body: decision.data.currentSituation || undefined,
        link: `/complaints/${complaintId}?tab=ai`,
        entityType: "complaint",
        entityId: complaintId,
      });
    }

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Advisor analysis failed";
    try {
      await admin.from("complaint_ai_recommendations").update({ analysis_status: "failed", analysis_error: msg }).eq("complaint_id", complaintId);
    } catch {
      // best-effort only
    }
    return { ok: false, error: msg };
  }
}
