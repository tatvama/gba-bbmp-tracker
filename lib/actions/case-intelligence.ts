"use server";

import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCaseIntelligence, STALE_BUILD_MS } from "@/lib/intelligence/engine";

/**
 * Fire-and-forget trigger, called at the end of every complaint-mutating server
 * action (alongside triggerAdvisorAnalysis) so the cached Case Intelligence
 * artifact is proactively refreshed whenever a new document, reply, action, or
 * escalation is recorded — not only lazily the next time someone requests a
 * letter draft. Mirrors triggerAdvisorAnalysis's after() idiom (lib/actions/
 * ai-advisor.ts): safe here because this app runs as a long-lived Node/Docker
 * process (Coolify), not serverless. Cheap when nothing changed: engine.ts's
 * context-hash gate skips the rebuild entirely unless the case actually changed.
 * Never throws into the caller.
 */
export async function triggerCaseIntelligenceRebuild(complaintId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    // Skip if a build is already in-flight and fresh — another path (e.g. a
    // document upload's analyzeDocumentById, or a near-simultaneous mutation)
    // already kicked one. Avoids scheduling a redundant ~90s build and avoids
    // clobbering a live 'running' claim back to 'queued'. A stale in-flight row
    // (dead build) falls through and is re-kicked.
    const { data: cur } = await admin
      .from("case_intelligence")
      .select("build_status, updated_at")
      .eq("complaint_id", complaintId)
      .maybeSingle();
    const fresh = !!cur?.updated_at && Date.now() - Date.parse(cur.updated_at as string) < STALE_BUILD_MS;
    if (fresh && (cur?.build_status === "queued" || cur?.build_status === "running")) return;

    // Mark queued immediately so a page loaded mid-rebuild can show that state;
    // the previous artifact (if any) is left untouched until the rebuild lands.
    await admin
      .from("case_intelligence")
      .upsert({ complaint_id: complaintId, build_status: "queued" }, { onConflict: "complaint_id" });

    after(async () => {
      const a = createAdminClient();
      try {
        await buildCaseIntelligence(a, complaintId);
      } catch (e) {
        await a
          .from("case_intelligence")
          .update({ build_status: "failed", build_error: e instanceof Error ? e.message : "Case intelligence rebuild failed" })
          .eq("complaint_id", complaintId);
      }
    });
  } catch (e) {
    console.warn("[triggerCaseIntelligenceRebuild] failed to enqueue", e);
  }
}
