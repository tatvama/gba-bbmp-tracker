import "server-only";
import { extractJson } from "@/lib/ai/json-extract";
import { COMPLAINT_DRAFT_KINDS, type ComplaintDraftKind } from "@/lib/constants";
import type { ReplyGap } from "@/lib/ai/reply-gap-analyzer";
import type { HealthScoreResult } from "./health-score";
import type { ReminderSuggestion } from "./reminder-workflow";
import { ACTION_LABELS, ACTION_LABELS_KN } from "./narrative-agent";
import type {
  AdvisorContext,
  Commitment,
  Contradiction,
  OutstandingIssue,
  RecommendationAction,
} from "./types";
import { RECOMMENDATION_ACTIONS } from "./types";

/**
 * The advisor's deep pass. Unlike the old narrative agent (which only PHRASED a
 * date-math decision), this reconstructs the WHOLE correspondence — original
 * complaint + demands, every department reply (full text), every letter WE sent
 * (counter-replies / reminders / escalations), reminders, escalations + their
 * responses, document OCR, the timeline, and the PREVIOUS recommendation's still-
 * open issues + commitments — and reasons over all of it to (a) decide the single
 * primary next action and (b) track what's still open, what contradicts an earlier
 * reply, and which department promises were / weren't kept. It NEVER looks at only
 * the latest reply in isolation.
 */

export interface ThreadDecision {
  currentSituation: string;
  reasoning: string;
  outstandingIssues: OutstandingIssue[];
  contradictions: Contradiction[];
  commitments: Commitment[];
  recommendedAction: RecommendationAction;
  recommendationLabel: string;
  confidenceBand: "High" | "Medium" | "Low";
  confidenceScore: number;
  expectedOutcome: string;
  timelineSummary: string;
  detectedRisks: string[];
  missingInformation: string[];
  /** How many pieces of correspondence the pass considered (deterministic). */
  analyzedCount: number;
}

/** When the AI is unavailable/fails: carry forward prior open state, don't wipe it. */
function fallback(
  action: RecommendationAction,
  healthScore: HealthScoreResult,
  ctx: AdvisorContext,
  analyzedCount: number,
): ThreadDecision {
  const prev = ctx.previousRecommendation;
  return {
    currentSituation: healthScore.riskFactors.length
      ? healthScore.riskFactors.join("; ")
      : "AI ವಿವರಣೆ ಲಭ್ಯವಿಲ್ಲ (AI ಕಾನ್ಫಿಗರ್ ಆಗಿಲ್ಲ ಅಥವಾ ವಿನಂತಿ ವಿಫಲವಾಗಿದೆ).",
    reasoning: "",
    outstandingIssues: prev?.outstanding_issues ?? [],
    contradictions: prev?.contradictions ?? [],
    commitments: prev?.commitments ?? [],
    recommendedAction: action,
    recommendationLabel: ACTION_LABELS_KN[action],
    confidenceBand: "Low",
    confidenceScore: 0,
    expectedOutcome: "",
    timelineSummary: "",
    detectedRisks: healthScore.riskFactors,
    missingInformation: [],
    analyzedCount,
  };
}

function cap(s: string | null | undefined, n: number): string {
  const t = (s ?? "").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/** Reconstruct the full correspondence as an ordered, bounded text block. */
function buildCorrespondence(ctx: AdvisorContext, demands: string): { text: string; count: number } {
  const c = ctx.complaint;
  const lines: string[] = [];
  let count = 0;

  lines.push("=== ORIGINAL COMPLAINT ===");
  lines.push(`Case ${c.internal_case_number ?? "—"}: ${c.title}`);
  lines.push(`Type: ${c.type} | Status: ${c.status} | Filed: ${c.date_submitted ?? "not yet"}`);
  if (c.description) lines.push(`Description: ${cap(c.description, 1500)}`);

  lines.push("\n=== ORIGINAL DEMANDS / REQUESTED ACTIONS + FORENSIC FINDINGS ===");
  lines.push(cap(demands, 4000) || "(none on record)");

  // Interleave department replies and our own drafts is hard without a shared
  // clock; instead present each stream in order and let the AI cross-reference
  // by date. Department replies first (what they said), then our letters.
  if (ctx.replies.length) {
    lines.push("\n=== DEPARTMENT REPLIES (oldest first) ===");
    for (const r of ctx.replies) {
      count++;
      const body = cap(r.reply_full_text || r.reply_summary, 2000);
      lines.push(
        `Reply [${r.reply_date ?? r.created_at?.slice(0, 10) ?? "?"}]${r.replied_by_name ? ` by ${r.replied_by_name}` : ""}${r.is_satisfactory === false ? " (marked NOT satisfactory)" : ""}: ${body}${r.issues_remaining ? ` | Noted still-pending: ${cap(r.issues_remaining, 500)}` : ""}`,
      );
    }
  }

  // Reply/report documents (OCR) that aren't already captured as structured
  // replies — EXCLUDING our own filed counter-replies (they're outbound, shown
  // in the "letters we sent" block below, and their type contains "reply").
  const replyDocs = ctx.documents.filter(
    (d) => /reply|action taken|atr|report|inspection/i.test(d.document_type ?? "") && !/counter/i.test(d.document_type ?? ""),
  );
  if (replyDocs.length) {
    lines.push("\n=== UPLOADED REPLY / REPORT DOCUMENTS (OCR) ===");
    for (const d of replyDocs) {
      count++;
      const body = cap(d.ai_summary || d.ocr_clean_text || d.ocr_raw_text, 1500);
      lines.push(`Document [${d.document_date ?? d.uploaded_at?.slice(0, 10) ?? "?"}] ${d.document_type ?? "document"}: ${body || "(no text extracted)"}`);
    }
  }

  if (ctx.actions.length) {
    lines.push("\n=== ACTION-TAKEN REPORTS ===");
    for (const a of ctx.actions) {
      count++;
      lines.push(`Action [${a.action_taken_date ?? "?"}]: ${cap(a.action_summary, 1200)}${a.pending_work ? ` | Still pending: ${cap(a.pending_work, 400)}` : ""}`);
    }
  }

  if (ctx.aiDrafts.length) {
    lines.push("\n=== LETTERS WE SENT (our counter-replies / reminders / escalation letters) ===");
    for (const d of ctx.aiDrafts) {
      count++;
      const label = (COMPLAINT_DRAFT_KINDS as Record<string, string>)[d.kind ?? ""] ?? d.kind ?? "letter";
      lines.push(`Our ${label} [${d.created_at?.slice(0, 10) ?? "?"}]: ${cap(d.content, 1500)}`);
    }
  }

  if (ctx.escalations.length) {
    lines.push("\n=== ESCALATIONS ===");
    for (const e of ctx.escalations) {
      count++;
      lines.push(`Escalation [${e.escalated_on ?? "?"}] to ${e.to_level ?? "?"}: ${cap(e.reason, 600)}${e.response_received ? ` | Response: ${cap(e.response_received, 600)}` : " | no response recorded"}`);
    }
  }

  if (ctx.reminders.length) {
    lines.push("\n=== REMINDERS ===");
    for (const r of ctx.reminders.slice(-10)) {
      lines.push(`Reminder [${r.due_date ?? "?"}] ${r.title ?? ""} — ${r.status ?? "?"}`);
    }
  }

  // Prior open state so the pass VERIFIES against it instead of starting fresh.
  const prev = ctx.previousRecommendation;
  if (prev && (prev.outstanding_issues?.length || prev.commitments?.length)) {
    lines.push("\n=== PRIOR OPEN STATE (from the last analysis — verify against the newest correspondence) ===");
    for (const i of prev.outstanding_issues ?? []) lines.push(`Previously ${i.status}: ${i.issue}`);
    for (const m of prev.commitments ?? []) lines.push(`Prior commitment (${m.status}): ${m.commitment}${m.dueBy ? ` (due ${m.dueBy})` : ""}`);
  }

  return { text: lines.join("\n"), count };
}

const SYSTEM =
  "You are the case-strategy advisor for a citizen holding BBMP/GBA (Bengaluru civic body) accountable on a public-works complaint. You are given the COMPLETE correspondence so far. Reason over ALL of it — never judge only the latest reply. Decide the single most useful next step and track what remains open. " +
  "CAUTIOUS FRAMING (non-negotiable): treat every adverse point as a documented suspicion requiring records/explanation — never assert that a named officer or contractor committed fraud, theft, forgery or corruption. Do not invent dates, amounts, or facts not present in the correspondence. " +
  "LANGUAGE (non-negotiable): write every human-readable text value in formal Kannada (ಕನ್ನಡ) — currentSituation, reasoning, recommendationLabel, expectedOutcome, timelineSummary, and every string inside outstandingIssues[].issue, contradictions[].summary, contradictions[].conflictsWith, commitments[].commitment, detectedRisks[] and missingInformation[]. Do NOT translate the machine values: recommendedAction, confidenceBand (must stay exactly High/Medium/Low), the status tokens (open/answered/partial and pending/fulfilled/overdue/unmet) and all dates (YYYY-MM-DD) MUST remain the exact English/enum tokens listed. " +
  "NUMERALS (non-negotiable): inside the Kannada text, write every number — rupee amounts, percentages, day/month counts, quantities, job/case numbers — using standard Arabic numerals (0,1,2,3,4,5,6,7,8,9), exactly like official Kannada government letters do. NEVER use Kannada-script digits (೦೧೨೩೪೫೬೭೮೯). Example: write 'ರೂ. 3,00,000 ರಿಂದ ರೂ. 6,00,000' — NOT 'ರೂ. ೩,೦೦,೦೦೦ ರಿಂದ ರೂ. ೬,೦೦,೦೦೦'. " +
  "Output STRICT JSON only, no prose, no markdown.";

export async function analyzeThread(input: {
  context: AdvisorContext;
  healthScore: HealthScoreResult;
  demands: string;
  replyGap?: ReplyGap | null;
  reminderSuggestion?: ReminderSuggestion | null;
  evidenceGaps?: string[];
  /** What the deterministic rules would pick — a strong hint + the AI-off fallback. */
  deterministicFallbackAction: RecommendationAction;
}): Promise<{ ok: boolean; data: ThreadDecision; error?: string }> {
  const { context: ctx, healthScore, deterministicFallbackAction: fb } = input;
  const { text: correspondence, count: analyzedCount } = buildCorrespondence(ctx, input.demands);
  const base = fallback(fb, healthScore, ctx, analyzedCount);

  const LADDER_STAGE_LABEL: Record<string, string> = {
    awaiting_ack: "waiting for the department's acknowledgment",
    awaiting_reply: "the original letter is awaiting a reply",
    reminder_sent: "a reminder letter has already gone out and is awaiting a reply",
    legal_notice_sent: "a legal notice has already gone out (after the reminder) and is awaiting a reply",
    escalated: "already escalated to Lokayukta / Chief Secretary / CM office",
    replied: "a reply has been received",
    closed: "closed",
  };
  const ladderStage = ctx.complaint.escalation_stage;

  const signals = [
    `Deterministic health score: ${healthScore.healthScore}/100 (${healthScore.riskLevel} risk).`,
    healthScore.riskFactors.length ? `Risk factors: ${healthScore.riskFactors.join("; ")}.` : "",
    ladderStage
      ? `No-reply escalation ladder status (round ${ctx.complaint.escalation_round}): ${LADDER_STAGE_LABEL[ladderStage] ?? ladderStage}. The ladder auto-drafts the next letter on its own schedule (reminder -> legal notice -> escalation) — your job is to judge whether the CONTENT of the correspondence already warrants moving faster or slower than that schedule, not to duplicate its date math.`
      : "",
    input.reminderSuggestion ? `Reminder/escalation timing: ${input.reminderSuggestion.reasonLabel} (${input.reminderSuggestion.daysSinceEvent} days).` : "",
    input.replyGap ? `Latest reply-gap check: ${input.replyGap.summary} (${input.replyGap.unaddressedCount} demand(s) unaddressed).` : "",
    input.evidenceGaps?.length ? `Evidence gaps detected: ${input.evidenceGaps.join("; ")}.` : "",
    `Deterministic fallback action (a strong hint — override only if the fuller history clearly warrants it): ${fb} — "${ACTION_LABELS[fb]}".`,
  ].filter(Boolean).join("\n");

  const actionList = RECOMMENDATION_ACTIONS.join(", ");

  const prompt = `${correspondence.slice(0, 24_000)}

=== DETERMINISTIC SIGNALS ===
${signals}

Work through these questions against the COMPLETE correspondence above:
- Has the department addressed every issue originally raised?
- Are any questions from our previous counter-replies still unanswered?
- Has any reply contradicted an earlier reply?
- Did the department make commitments, and were they fulfilled, overdue, or ignored?
- Has enough evidence now been provided?
- Would another counter-reply be meaningful, or is escalation now appropriate?
- Has an escalation already been sent and then STALLED — escalated with no response on record for a long time? If so, converting to a formal RTI request to compel the records is usually the strongest next step.
- Has the complaint been satisfactorily resolved / can it be recommended for closure?

Then choose EXACTLY ONE primary next action from: ${actionList}.
Guidance: 'wait' = within SLA, nothing to do yet; 'generate_reminder' = no reply and the wait has run long (note: the ladder auto-drafts this reminder on its own schedule too — recommend it explicitly only if the content already justifies acting sooner than that schedule); 'request_clarification' = a reply came but is ambiguous/incomplete on specific points; 'counter_reply' = a reply came but left demands unaddressed and pressing it is still worthwhile; 'upload_evidence' = our own case needs more supporting documents; 'escalate' = the department is stonewalling, contradicting itself, or has broken commitments badly enough to jump ahead of the ladder's own reminder/legal-notice pacing and go straight to a higher authority (Lokayukta / Chief Secretary / CM office) — if a reminder or legal notice has already gone out per the ladder status above and is simply still awaiting its own deadline, prefer 'wait' unless the content genuinely warrants moving faster; 'convert_to_rti' = an escalation has already been sent and STALLED (no response for a long time), so an RTI request under the RTI Act 2005 is now the strongest lever to compel the records; 'close' = fully resolved or nothing further is useful; 'review' = you cannot judge and a human must look.

Output STRICT JSON of EXACTLY this shape:
{
  "currentSituation": "1-2 sentences: where the case stands right now, given the whole thread",
  "reasoning": "2-4 sentences: why the chosen action, referencing the history (unanswered points, contradictions, unmet commitments)",
  "outstandingIssues": [{"issue": "short phrase", "firstRaisedOn": "YYYY-MM-DD or null", "status": "open|answered|partial"}],
  "contradictions": [{"summary": "what the department said that conflicts", "conflictsWith": "the earlier statement it conflicts with"}],
  "commitments": [{"commitment": "what they promised", "madeOn": "YYYY-MM-DD or null", "dueBy": "YYYY-MM-DD or null", "status": "pending|fulfilled|overdue|unmet"}],
  "recommendedAction": "one of: ${actionList}",
  "recommendationLabel": "short human label for the action, e.g. 'Escalate to the Executive Engineer'",
  "confidenceBand": "High|Medium|Low",
  "confidenceScore": 0,
  "expectedOutcome": "1 sentence on what this action should achieve",
  "timelineSummary": "1-2 sentence recap of the correspondence so far",
  "detectedRisks": ["short risk phrase beyond the given risk factors, if any"],
  "missingInformation": ["short phrase describing info still missing, if any"]
}
Use empty arrays / null where there is nothing. confidenceScore is an integer 0-100 that should agree with confidenceBand (High≈75-100, Medium≈45-74, Low≈0-44).
REMINDER: all free-text values above must be in formal Kannada (ಕನ್ನಡ); recommendedAction, confidenceBand, the status tokens and dates stay in English exactly as specified. ALL NUMBERS inside the Kannada text (amounts, percentages, day counts) must use Arabic numerals 0-9 — never Kannada-script digits (೦-೯).`;

  // Kannada is far more token-dense than English (a Kannada character can be
  // several tokens): a full Kannada response for this schema measured ~7,900
  // output tokens, vs the old 3500 cap that truncated mid-object and failed to
  // parse — silently dropping back to the English fallback. 10k gives headroom
  // for complaints with longer histories. Hitting the cap = English fallback, so
  // over-provision rather than risk truncation.
  const r = await extractJson<Partial<ThreadDecision>>({ system: SYSTEM, prompt, fallback: base, maxTokens: 10_000 });
  if (!r.ok) return { ok: false, data: base, error: r.error };

  const d = r.data;
  const action = RECOMMENDATION_ACTIONS.includes(d.recommendedAction as RecommendationAction)
    ? (d.recommendedAction as RecommendationAction)
    : fb;
  const band: ThreadDecision["confidenceBand"] = ["High", "Medium", "Low"].includes(d.confidenceBand as string)
    ? (d.confidenceBand as ThreadDecision["confidenceBand"])
    : "Low";
  const rawScore = Number(d.confidenceScore);
  const score = Number.isFinite(rawScore) ? Math.min(100, Math.max(0, Math.round(rawScore))) : band === "High" ? 80 : band === "Medium" ? 55 : 25;

  return {
    ok: true,
    data: {
      currentSituation: d.currentSituation ?? base.currentSituation,
      reasoning: d.reasoning ?? "",
      outstandingIssues: Array.isArray(d.outstandingIssues) ? d.outstandingIssues : [],
      contradictions: Array.isArray(d.contradictions) ? d.contradictions : [],
      commitments: Array.isArray(d.commitments) ? d.commitments : [],
      recommendedAction: action,
      recommendationLabel: d.recommendationLabel || ACTION_LABELS_KN[action],
      confidenceBand: band,
      confidenceScore: score,
      expectedOutcome: d.expectedOutcome ?? "",
      timelineSummary: d.timelineSummary ?? "",
      detectedRisks: Array.isArray(d.detectedRisks) ? d.detectedRisks : [],
      missingInformation: Array.isArray(d.missingInformation) ? d.missingInformation : [],
      analyzedCount,
    },
  };
}
