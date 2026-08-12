"use server";

import { after } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/db";
import { runAdvisorAnalysis, resolveAdvisorLanguage } from "@/lib/ai/advisor/recommendation-engine";
import type { AdvisorLanguage, RecommendationRow } from "@/lib/ai/advisor/types";

const nowISO = () => new Date().toISOString();

/**
 * Fire-and-forget trigger, called at the end of every complaint-mutating server
 * action. Mirrors the background_jobs `after()` idiom already used by
 * startAiDraftJob (lib/actions/jobs.ts) — safe here because this app runs as a
 * long-lived Node/Docker process (Coolify), not serverless. Never throws into
 * the caller: a total AI/DB outage here must not break the calling action.
 */
export async function triggerAdvisorAnalysis(complaintId: string, language?: AdvisorLanguage): Promise<void> {
  try {
    const admin = createAdminClient();
    // Only touches analysis_status (Postgres upsert ON CONFLICT DO UPDATE only
    // sets columns present in the payload) — health score / narrative fields
    // from the last successful run are left untouched, so a page loaded
    // mid-analysis still shows the last-known-good state, never a blank card.
    await admin
      .from("complaint_ai_recommendations")
      .upsert({ complaint_id: complaintId, analysis_status: "queued" }, { onConflict: "complaint_id" });

    after(async () => {
      const a = createAdminClient();
      try {
        // No language passed → runAdvisorAnalysis keeps the row's current
        // display language (see its `lang` resolution). Callers that need a
        // specific language pass it explicitly.
        await runAdvisorAnalysis(a, complaintId, language ? { language } : undefined);
      } catch (e) {
        await a
          .from("complaint_ai_recommendations")
          .update({ analysis_status: "failed", analysis_error: e instanceof Error ? e.message : "Advisor analysis failed" })
          .eq("complaint_id", complaintId);
      }
    });
  } catch (e) {
    console.warn("[triggerAdvisorAnalysis] failed to enqueue", e);
  }
}

/**
 * Switch the advisor's display language (English ↔ Kannada). If that language is
 * already cached for the current case-state, it's promoted synchronously and the
 * updated row comes back immediately (instant, no AI call). Otherwise the row is
 * marked queued and a background generation is kicked; the panel polls for it.
 */
export async function setAdvisorLanguageAction(
  complaintId: string,
  language: AdvisorLanguage,
): Promise<RecommendationRow | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const admin = createAdminClient();

  const res = await resolveAdvisorLanguage(admin, complaintId, language);
  if (res.status === "needs-regen") {
    // Optimistically record the target language + queued state so the panel can
    // show a "switching…" indicator while the background pass generates it.
    await admin
      .from("complaint_ai_recommendations")
      .update({ narrative_language: language, analysis_status: "queued" })
      .eq("complaint_id", complaintId);
    after(async () => {
      const a = createAdminClient();
      try {
        await runAdvisorAnalysis(a, complaintId, { language });
      } catch (e) {
        await a
          .from("complaint_ai_recommendations")
          .update({ analysis_status: "failed", analysis_error: e instanceof Error ? e.message : "Advisor analysis failed" })
          .eq("complaint_id", complaintId);
      }
    });
  }

  const { data } = await admin.from("complaint_ai_recommendations").select("*").eq("complaint_id", complaintId).maybeSingle();
  return (data as RecommendationRow | null) ?? null;
}

/** Read the cached recommendation for a complaint (admin client — this table has no RLS, matching background_jobs/notifications). */
export async function getComplaintAiRecommendationAction(complaintId: string): Promise<RecommendationRow | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("complaint_ai_recommendations").select("*").eq("complaint_id", complaintId).maybeSingle();
  return (data as RecommendationRow | null) ?? null;
}

/** Record that a reminder draft was generated from the advisor's one-click action — feeds the reminder-workflow's duplicate-prevention check. */
export async function markReminderGenerated(complaintId: string, draftId?: string): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  const admin = createAdminClient();
  await admin
    .from("complaint_ai_recommendations")
    .update({ last_reminder_generated_at: nowISO(), last_reminder_draft_id: draftId ?? null })
    .eq("complaint_id", complaintId);
}

/** Record that an escalation draft was generated from the advisor's one-click action. */
export async function markEscalationGenerated(complaintId: string, draftId?: string): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  const admin = createAdminClient();
  await admin
    .from("complaint_ai_recommendations")
    .update({ last_escalation_generated_at: nowISO(), last_escalation_draft_id: draftId ?? null })
    .eq("complaint_id", complaintId);
}
