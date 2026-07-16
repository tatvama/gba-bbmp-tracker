"use server";

import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCaseIntelligence } from "@/lib/intelligence/engine";

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
