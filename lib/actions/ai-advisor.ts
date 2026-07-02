"use server";

import { after } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAdvisorAnalysis } from "@/lib/ai/advisor/recommendation-engine";
import type { RecommendationRow } from "@/lib/ai/advisor/types";

const nowISO = () => new Date().toISOString();

/**
 * Fire-and-forget trigger, called at the end of every complaint-mutating server
 * action. Mirrors the background_jobs `after()` idiom already used by
 * startAiDraftJob (lib/actions/jobs.ts) — safe here because this app runs as a
 * long-lived Node/Docker process (Coolify), not serverless. Never throws into
 * the caller: a total AI/DB outage here must not break the calling action.
 */
export async function triggerAdvisorAnalysis(complaintId: string): Promise<void> {
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
        await runAdvisorAnalysis(a, complaintId);
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
