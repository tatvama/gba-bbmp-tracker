import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAiConfigured } from "@/lib/ai/provider";
import { notifyUser } from "@/lib/notifications";
import { buildAdvisorContext } from "./context-builder";
import { computeContextHash } from "./context-hash";
import { computeHealthScore } from "./health-score";
import { evaluateReminderWorkflow } from "./reminder-workflow";
import { evaluateReply } from "./reply-agent";
import { generateAdvisorNarrative } from "./narrative-agent";
import { checkEvidenceCompleteness } from "./evidence";
import type { RecommendationAction } from "./types";

export interface RunAdvisorResult {
  ok: boolean;
  skipped?: "unchanged" | "already-running" | "disabled" | "not-found";
  error?: string;
}

const ACTIONABLE = new Set<RecommendationAction>(["generate_reminder", "escalate", "counter_reply"]);

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

    // Decide the action deterministically first — the AI only explains it.
    const replyEval = await evaluateReply(admin, complaintId);
    const reminderSuggestion = evaluateReminderWorkflow(ctx);
    const evidenceGaps = checkEvidenceCompleteness(ctx);

    let action: RecommendationAction;
    if (replyEval.hasReply) {
      action = replyEval.suggestedAction;
    } else if (reminderSuggestion.action === "generate_reminder") {
      action = "generate_reminder";
    } else if (reminderSuggestion.action === "escalate") {
      action = "escalate";
    } else {
      action = "wait";
    }

    const narrative = await generateAdvisorNarrative({
      context: ctx,
      healthScore,
      action,
      replyGap: replyEval.gap,
      reminderSuggestion,
      evidenceGaps,
    });

    const previousAction = ctx.previousRecommendation?.recommendation_action ?? null;

    // Deterministic evidence-completeness checks (no AI call) are merged with
    // whatever the narrative call added, so missing evidence is still flagged
    // even when AI is unavailable or the narrative call fails.
    const missingInformation = Array.from(new Set([...evidenceGaps, ...narrative.data.missingInformation]));

    await admin
      .from("complaint_ai_recommendations")
      .update({
        current_situation: narrative.data.currentSituation,
        reasoning: narrative.data.reasoning,
        expected_outcome: narrative.data.expectedOutcome,
        confidence: narrative.data.confidence,
        recommendation: narrative.data.recommendation,
        recommendation_action: action,
        missing_information: missingInformation,
        detected_risks: narrative.data.detectedRisks,
        timeline_summary: narrative.data.timelineSummary,
        context_hash: newHash,
        last_analyzed_at: new Date().toISOString(),
        analysis_status: "done",
        analysis_error: narrative.ok ? null : narrative.error ?? null,
        ai_configured_at_analysis: isAiConfigured(),
      })
      .eq("complaint_id", complaintId);

    if (ACTIONABLE.has(action) && action !== previousAction && ctx.complaint.created_by) {
      await notifyUser(admin, ctx.complaint.created_by, {
        type: "info",
        title: `AI Advisor: ${narrative.data.recommendation}`,
        body: narrative.data.currentSituation || undefined,
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
