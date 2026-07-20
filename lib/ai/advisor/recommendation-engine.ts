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
import { translateNarrative } from "./translate-narrative";
import { gatherReplyGapInputs } from "@/lib/actions/lifecycle";
import type { AdvisorLanguage, NarrativeSnapshot, RecommendationAction } from "./types";

export interface RunAdvisorResult {
  ok: boolean;
  skipped?: "unchanged" | "already-running" | "disabled" | "not-found";
  error?: string;
}

/** Map a cached narrative snapshot onto the flat row columns it projects into. */
function projectSnapshot(s: NarrativeSnapshot) {
  return {
    current_situation: s.current_situation,
    reasoning: s.reasoning,
    expected_outcome: s.expected_outcome,
    confidence: s.confidence,
    confidence_score: s.confidence_score,
    recommendation: s.recommendation,
    recommendation_action: s.recommendation_action,
    missing_information: s.missing_information,
    detected_risks: s.detected_risks,
    outstanding_issues: s.outstanding_issues,
    contradictions: s.contradictions,
    commitments: s.commitments,
    analyzed_correspondence_count: s.analyzed_correspondence_count,
    timeline_summary: s.timeline_summary,
  };
}

const ACTIONABLE = new Set<RecommendationAction>([
  "generate_reminder",
  "escalate",
  "counter_reply",
  "request_clarification",
  "close",
  "convert_to_rti",
]);

/**
 * A run that dies mid-flight (a dev-server restart killing the after() callback,
 * a crash, or a timeout) leaves analysis_status='running' forever — and the
 * single-flight claim would then refuse EVERY future analysis for that
 * complaint, so the panel spins on "Analysing…" indefinitely. A 'running' lock
 * older than this is therefore treated as dead and reclaimable. No real run
 * (a single AI call) approaches two minutes, so a live run is never interrupted.
 */
const STALE_LOCK_MS = 120_000;

/**
 * Orchestrator: build context -> single-flight claim -> deterministic health
 * score (always, cheap) -> context-hash cache gate -> reply/reminder decision
 * -> AI narrative -> upsert. Never throws — callers (triggerAdvisorAnalysis's
 * after() callback, the cron sweep) treat this as best-effort.
 */
export async function runAdvisorAnalysis(
  admin: SupabaseClient,
  complaintId: string,
  opts?: { language?: AdvisorLanguage },
): Promise<RunAdvisorResult> {
  // Ensure a row exists so the atomic claim below has something to touch.
  // ignoreDuplicates means this is a no-op (doesn't clobber existing data) when
  // a row is already there.
  await admin
    .from("complaint_ai_recommendations")
    .upsert({ complaint_id: complaintId }, { onConflict: "complaint_id", ignoreDuplicates: true });

  // Single-flight claim: proceed only if no OTHER run currently owns this row —
  // i.e. it's not 'running', OR its 'running' lock is stale (a prior run died).
  // Row-level UPDATE locking still makes two concurrent claimers mutually
  // exclusive; this only lets a caller reclaim a dead lock, never a live one.
  const staleCutoff = new Date(Date.now() - STALE_LOCK_MS).toISOString();
  const { data: claimed, error: claimError } = await admin
    .from("complaint_ai_recommendations")
    .update({ analysis_status: "running" })
    .eq("complaint_id", complaintId)
    .or(`analysis_status.neq.running,updated_at.lt.${staleCutoff}`)
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

    // The advisor reasons ONCE in English (the canonical base, generated below);
    // the Kannada view is a cheap, cached TRANSLATION of it, never a second AI
    // reasoning run. `lang` is the language to DISPLAY (what the flat columns
    // hold): an explicit request (a panel toggle) wins, else the row's current
    // display language, else Kannada (the default the panel opens in).
    const lang: AdvisorLanguage = opts?.language ?? ctx.previousRecommendation?.narrative_language ?? "kn";

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
    // just overwrote analysis_status on this same row. The hash is now language-
    // INDEPENDENT (the case-state fingerprint); each language's narrative is
    // cached separately in `narratives` under this same hash.
    const caseHash = computeContextHash(ctx);
    const prev = ctx.previousRecommendation;
    const cachedNarratives = (prev?.narratives ?? {}) as Partial<Record<AdvisorLanguage, NarrativeSnapshot>>;
    const caseUnchanged = prev?.context_hash === caseHash;
    const cachedForLang = caseUnchanged ? cachedNarratives[lang] : undefined;

    // Fast path (no AI call): the requested language is already generated for
    // the current case-state. Just make it the active projection — this is what
    // makes toggling back to a previously-viewed language instant and free. If
    // it's already the active language, nothing changed at all.
    if (cachedForLang) {
      const alreadyActive = prev?.narrative_language === lang;
      await admin
        .from("complaint_ai_recommendations")
        .update({ ...(alreadyActive ? {} : projectSnapshot(cachedForLang)), narrative_language: lang, analysis_status: "done" })
        .eq("complaint_id", complaintId);
      return { ok: true, skipped: "unchanged" };
    }

    // Ensure the ENGLISH base snapshot exists for this case-state: reuse the
    // cached one when the case is unchanged, otherwise run the deep pass ONCE (in
    // English). `ranAdvisor` gates the notification; `enOk` gates caching.
    let enSnapshot = caseUnchanged ? cachedNarratives.en : undefined;
    let enOk = !!enSnapshot;
    let enError: string | null = null;
    let ranAdvisor = false;
    let action: RecommendationAction | undefined;
    const previousAction = prev?.recommendation_action ?? null;

    if (!enSnapshot) {
      // Deterministic signals — STRONG HINTS into the AI's full-history reasoning
      // + the fallback action when AI is unavailable / fails. Produced in English
      // (the base); the Kannada view gets them via translation below.
      const replyEval = await evaluateReply(admin, complaintId);
      const reminderSuggestion = evaluateReminderWorkflow(ctx);
      const evidenceGaps = checkEvidenceCompleteness(ctx, "en");
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
      // track outstanding issues / contradictions / commitments. Always English.
      const decision = await analyzeThread({
        context: ctx,
        healthScore,
        demands,
        replyGap: replyEval.gap,
        reminderSuggestion,
        evidenceGaps,
        deterministicFallbackAction: deterministicFallback,
        language: "en",
      });

      ranAdvisor = true;
      enOk = decision.ok;
      enError = decision.ok ? null : decision.error ?? null;
      action = reconcileAction(decision.data.recommendedAction, deterministicFallback, decision.ok);

      // Deterministic evidence-completeness checks are merged with the AI's, so
      // missing evidence is still flagged even when the AI pass is unavailable.
      const missingInformation = Array.from(new Set([...evidenceGaps, ...decision.data.missingInformation]));

      enSnapshot = {
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
      };
    }

    // The snapshot to DISPLAY: English as-is, or a cached/fresh TRANSLATION of the
    // English base (no second reasoning run). Skip the translation on a failed
    // pass — just show the English fallback rather than translate a fallback.
    const targetSnapshot: NarrativeSnapshot =
      lang === "en" || !enOk ? enSnapshot : await translateNarrative(admin, enSnapshot, lang);

    // Cache the English base + the displayed language under the current case-hash.
    // Case unchanged → merge (keep any other cached language so toggling stays
    // free); changed → replace (never carry a stale-language snapshot). Only on a
    // successful English pass — a failed generation must not poison the cache.
    const baseMap = caseUnchanged ? cachedNarratives : {};
    const nextNarratives: Partial<Record<AdvisorLanguage, NarrativeSnapshot>> = enOk
      ? { ...baseMap, en: enSnapshot, [lang]: targetSnapshot }
      : baseMap;

    await admin
      .from("complaint_ai_recommendations")
      .update({
        ...projectSnapshot(targetSnapshot),
        narrative_language: lang,
        narratives: nextNarratives,
        // Only cache the context hash when the English base generated cleanly.
        // Caching after a failed generation would make the hash gate skip every
        // future run, freezing the case on the fallback. Null lets it retry.
        context_hash: enOk ? caseHash : null,
        last_analyzed_at: new Date().toISOString(),
        analysis_status: "done",
        analysis_error: enError,
        ai_configured_at_analysis: isAiConfigured(),
      })
      .eq("complaint_id", complaintId);

    // Notify only when a FRESH reasoning pass produced a new primary action — a
    // language toggle or a cache hit is not a new recommendation.
    if (ranAdvisor && action && ACTIONABLE.has(action) && action !== previousAction && ctx.complaint.created_by) {
      await notifyUser(admin, ctx.complaint.created_by, {
        type: "info",
        title: `AI Advisor: ${targetSnapshot.recommendation ?? ""}`,
        body: targetSnapshot.current_situation || undefined,
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

/**
 * Try to switch the displayed language WITHOUT an AI call: if the requested
 * language is already cached for the current case-state, project it onto the
 * flat columns synchronously and report "promoted". Otherwise report
 * "needs-regen" so the caller can kick a background generation. No single-flight
 * claim — this only ever writes already-generated, case-consistent data, so a
 * concurrent full run can safely overwrite it with the same result.
 */
export async function resolveAdvisorLanguage(
  admin: SupabaseClient,
  complaintId: string,
  language: AdvisorLanguage,
): Promise<{ status: "promoted" | "needs-regen" | "not-found" }> {
  const ctx = await buildAdvisorContext(admin, complaintId);
  if (!ctx) return { status: "not-found" };

  const prev = ctx.previousRecommendation;
  const cachedNarratives = (prev?.narratives ?? {}) as Partial<Record<AdvisorLanguage, NarrativeSnapshot>>;
  const caseUnchanged = prev?.context_hash === computeContextHash(ctx);
  const snapshot = caseUnchanged ? cachedNarratives[language] : undefined;
  if (!snapshot) return { status: "needs-regen" };

  await admin
    .from("complaint_ai_recommendations")
    .update({ ...projectSnapshot(snapshot), narrative_language: language, analysis_status: "done" })
    .eq("complaint_id", complaintId);
  return { status: "promoted" };
}
