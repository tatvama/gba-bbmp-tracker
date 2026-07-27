import "server-only";
/**
 * The "ai_draft" job handler — moved out of lib/actions/jobs.ts's old inline
 * after() callback with NO logic changes (same runComplaintDraft call, same
 * ai_drafts insert, same post-draft advisor re-run); only the job-lifecycle
 * bookkeeping (claim/progress-write/retry/notify) that used to be hand-rolled
 * here is now the generic runner's job (lib/jobs/runner.ts).
 */
import { registerJobHandler } from "@/lib/jobs/registry";
import type { JobHandler } from "@/lib/jobs/types";
import { runComplaintDraft, type DraftProgress } from "@/lib/ai/complaint-draft";
import { runAdvisorAnalysis } from "@/lib/ai/advisor/recommendation-engine";
import type { ComplaintDraftKind, DraftLanguage, LegalTone, LegalNoticeSender } from "@/lib/constants";

export interface AiDraftJobInput {
  complaintId: string;
  kind: ComplaintDraftKind;
  tone?: LegalTone;
  language?: DraftLanguage;
  /** Petitioner identity for a `legal_notice` PIL (see startAiDraftJob). Passed
   *  straight through to runComplaintDraft, which uses it as the FROM block. */
  sender?: LegalNoticeSender;
  /** Sender identity for a non-PIL department letter (`counter_reply`,
   *  `reminder_letter`). Passed straight through to runComplaintDraft. */
  senderOverride?: { name: string; address: string; mobile?: string | null };
}

/** Rough progress % per real pipeline stage — "drafting" then ramps toward 90
 *  as streamed text accumulates. Purely cosmetic. */
const STAGE_PROGRESS: Record<DraftProgress["stage"], number> = {
  loading_case: 8,
  building_history: 20,
  building_intelligence: 22,
  drafting: 35,
  safety_check: 95,
};

const handler: JobHandler = async (ctx) => {
  const input = ctx.input as AiDraftJobInput;

  const onDraftProgress = (p: DraftProgress) => {
    const progress = p.stage === "drafting" && p.partialText ? Math.min(90, 35 + Math.floor(p.partialText.length / 25)) : STAGE_PROGRESS[p.stage];
    void ctx.updateProgress(progress, p.stage, p.label, { partial: true, text: p.partialText ?? null });
  };

  const r = await runComplaintDraft(ctx.admin, input, onDraftProgress);
  if (!r.ok || !r.text) {
    return { error: r.error ?? "Generation failed" };
  }

  // Persist the finished draft so it survives navigation (shows in Saved drafts).
  await ctx.admin.from("ai_drafts").insert({
    entity_type: "complaint",
    entity_id: input.complaintId,
    kind: input.kind,
    content: r.text,
    language: input.language ?? null,
    created_by: ctx.userId,
  });

  // The generated letter is fresh correspondence — re-run the advisor so its
  // next-step reasoning reflects what we just sent.
  await runAdvisorAnalysis(ctx.admin, input.complaintId).catch(() => {});

  return { result: { text: r.text, lintWarning: r.lintWarning ?? null, truncated: r.truncated ?? false, qualityReport: r.qualityReport ?? null } };
};

registerJobHandler("ai_draft", handler);
