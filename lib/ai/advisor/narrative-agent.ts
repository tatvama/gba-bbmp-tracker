import "server-only";
import { extractJson, extractorSystem } from "@/lib/ai/json-extract";
import type { ReplyGap } from "@/lib/ai/reply-gap-analyzer";
import type { HealthScoreResult } from "./health-score";
import type { ReminderSuggestion } from "./reminder-workflow";
import type { AdvisorContext, RecommendationAction } from "./types";

export interface AdvisorNarrative {
  currentSituation: string;
  reasoning: string;
  expectedOutcome: string;
  confidence: "High" | "Medium" | "Low";
  recommendation: string;
  missingInformation: string[];
  detectedRisks: string[];
  timelineSummary: string;
}

export const ACTION_LABELS: Record<RecommendationAction, string> = {
  generate_reminder: "Generate a reminder letter",
  escalate: "Escalate to the next authority",
  counter_reply: "Send a counter-reply",
  wait: "Continue waiting",
  close: "Close the complaint",
  upload_evidence: "Upload supporting evidence",
  review: "Manual review needed",
  none: "No action needed",
};

function fallback(action: RecommendationAction, healthScore: HealthScoreResult): AdvisorNarrative {
  return {
    currentSituation: healthScore.riskFactors.length
      ? healthScore.riskFactors.join("; ")
      : "No AI narrative available (AI not configured or the request failed).",
    reasoning: "",
    expectedOutcome: "",
    confidence: "Low",
    recommendation: ACTION_LABELS[action],
    missingInformation: [],
    detectedRisks: healthScore.riskFactors,
    timelineSummary: "",
  };
}

/** Compact chronology string, reusing the context-builder's already-fetched rows (no extra queries). */
function formatTimeline(ctx: AdvisorContext): string {
  const lines: string[] = [];
  for (const e of ctx.timeline.slice(-30)) {
    lines.push(`  - ${e.event_date ?? "?"} [${e.event_type}] ${e.title ?? ""}${e.summary ? `: ${e.summary}` : ""}`);
  }
  for (const r of ctx.replies) {
    lines.push(`Reply (${r.reply_date ?? "?"}): ${r.reply_summary ?? ""}${r.is_satisfactory === false ? " | marked NOT satisfactory" : ""}`);
  }
  for (const a of ctx.actions) {
    lines.push(`Action taken (${a.action_taken_date ?? "?"}): ${a.action_summary ?? ""}${a.pending_work ? ` | pending: ${a.pending_work}` : ""}`);
  }
  for (const e of ctx.escalations) {
    lines.push(`Escalation (${e.escalated_on ?? "?"}) to ${e.to_level ?? "?"}: ${e.reason ?? ""}`);
  }
  return lines.length ? lines.join("\n") : "No case history recorded yet.";
}

/**
 * The one new AI call in the advisor. The recommendation ACTION itself is
 * already decided deterministically (reply-agent / reminder-workflow) before
 * this is called — the AI's job is to explain/phrase the situation, reasoning,
 * confidence and expected outcome around that decision, not to invent its own
 * day-count math or override it.
 */
export async function generateAdvisorNarrative(input: {
  context: AdvisorContext;
  healthScore: HealthScoreResult;
  action: RecommendationAction;
  replyGap?: ReplyGap | null;
  reminderSuggestion?: ReminderSuggestion | null;
  evidenceGaps?: string[];
}): Promise<{ ok: boolean; data: AdvisorNarrative; error?: string }> {
  const { context: ctx, healthScore, action } = input;
  const base = fallback(action, healthScore);

  const system = extractorSystem(
    "You are an internal advisory assistant summarising the state of a citizen's civic complaint against BBMP/GBA for the caseworker managing it. You do not decide actions — a decision has already been made deterministically and is given to you. Explain it clearly, cautiously, and factually. Never invent dates, amounts, or facts not present in the case data.",
  );

  const c = ctx.complaint;
  const header = [
    `Case: ${c.internal_case_number ?? "—"} | ${c.title}`,
    `Type: ${c.type} | Status: ${c.status} | Priority: ${c.priority ?? "—"}`,
    c.date_submitted ? `Filed on: ${c.date_submitted}` : "Not yet filed.",
    c.latest_reply_summary ? `Latest reply (${c.latest_reply_date ?? "?"}): ${c.latest_reply_summary}` : "No reply received yet.",
    c.latest_action_taken_summary ? `Latest action taken (${c.latest_action_taken_date ?? "?"}): ${c.latest_action_taken_summary}` : "No action taken recorded.",
  ].join("\n");

  const decisionBlock = [
    `Deterministic health score: ${healthScore.healthScore}/100 (${healthScore.riskLevel} risk).`,
    healthScore.riskFactors.length ? `Detected risk factors: ${healthScore.riskFactors.join("; ")}.` : "No specific risk factors detected.",
    input.reminderSuggestion ? `Reminder/escalation workflow: ${input.reminderSuggestion.reasonLabel}.` : "",
    input.replyGap ? `Reply-gap analysis: ${input.replyGap.summary} (${input.replyGap.unaddressedCount} demand(s) unaddressed).` : "",
    input.evidenceGaps?.length ? `Evidence gaps already detected (include these verbatim in missingInformation): ${input.evidenceGaps.join("; ")}.` : "",
    `DECIDED ACTION (do not change this): ${action} — "${ACTION_LABELS[action]}".`,
  ].filter(Boolean).join("\n");

  const prompt = `${header}

${decisionBlock}

CASE HISTORY (chronology, replies, actions, escalations):
${formatTimeline(ctx).slice(0, 8_000)}

Output STRICT JSON of EXACTLY this shape:
{
  "currentSituation": "1-2 sentence factual description of where this case stands right now",
  "reasoning": "1-3 sentences explaining WHY the decided action makes sense given the case history and health score",
  "expectedOutcome": "1 sentence on what taking this action should achieve",
  "confidence": "High | Medium | Low",
  "recommendation": "a short human-readable label for the decided action, e.g. 'Escalate to the Executive Engineer'",
  "missingInformation": ["short phrase describing information still missing from the case, if any"],
  "detectedRisks": ["short phrase describing a risk you notice beyond the given risk factors, if any"],
  "timelineSummary": "1-2 sentence recap of the case chronology so far"
}
Use empty arrays/strings where there is nothing to add. Do not contradict the DECIDED ACTION.`;

  const r = await extractJson<AdvisorNarrative>({ system, prompt, fallback: base, maxTokens: 1200 });
  const data = { ...base, ...r.data };
  data.missingInformation = Array.isArray(data.missingInformation) ? data.missingInformation : [];
  data.detectedRisks = Array.isArray(data.detectedRisks) ? data.detectedRisks : [];
  if (!data.recommendation) data.recommendation = ACTION_LABELS[action];
  return { ok: r.ok, data, error: r.ok ? undefined : r.error };
}
