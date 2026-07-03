"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles, Loader2, AlertTriangle, ArrowRight, Bell, Gavel, MessageSquareReply,
  Camera, CircleCheck, Clock, Search, HelpCircle, ListChecks, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageChoiceButton } from "@/components/complaints/language-choice-button";
import { startAiDraftJob, getJobAction } from "@/lib/actions/jobs";
import { markReminderGenerated } from "@/lib/actions/ai-advisor";
import type { DraftLanguage } from "@/lib/constants";
import type { RecommendationRow, RecommendationAction } from "@/lib/ai/advisor/types";
import { AIHealthScore } from "./AIHealthScore";

// Button labels are Kannada — the advisor panel is always shown in Kannada.
const ACTION_META: Record<
  RecommendationAction,
  { icon: React.ComponentType<{ className?: string }>; buttonLabel: string | null }
> = {
  generate_reminder: { icon: Bell, buttonLabel: "ಜ್ಞಾಪನಾ ಪತ್ರ ರಚಿಸಿ" },
  escalate: { icon: Gavel, buttonLabel: "ಉನ್ನತೀಕರಣ ಪತ್ರ ಕರಡು ಮಾಡಿ" },
  counter_reply: { icon: MessageSquareReply, buttonLabel: "ಪ್ರತ್ಯುತ್ತರ ಕರಡು ಮಾಡಿ" },
  request_clarification: { icon: HelpCircle, buttonLabel: "ಸ್ಪಷ್ಟೀಕರಣ ವಿನಂತಿ ಕರಡು ಮಾಡಿ" },
  convert_to_rti: { icon: FileText, buttonLabel: "ಆರ್‌ಟಿಐ ವಿನಂತಿ ಕರಡು ಮಾಡಿ" },
  upload_evidence: { icon: Camera, buttonLabel: "ದಾಖಲೆಗಳಿಗೆ ಹೋಗಿ" },
  review: { icon: Search, buttonLabel: "ದಾಖಲೆಗಳನ್ನು ಪರಿಶೀಲಿಸಿ" },
  close: { icon: CircleCheck, buttonLabel: "ಪ್ರಕರಣ ಸಾರಾಂಶಕ್ಕೆ ಹೋಗಿ" },
  wait: { icon: Clock, buttonLabel: null },
  none: { icon: CircleCheck, buttonLabel: null },
};

/** Actions that generate a letter draft (and therefore ask for a language). The
 *  rest just navigate, so they need no language prompt. */
const GENERATE_ACTIONS = new Set<RecommendationAction>([
  "generate_reminder", "counter_reply", "request_clarification", "convert_to_rti",
]);

/** Kannada labels for the confidence band + issue-status chips. */
const CONFIDENCE_KN: Record<string, string> = { High: "ಹೆಚ್ಚು", Medium: "ಮಧ್ಯಮ", Low: "ಕಡಿಮೆ" };
const ISSUE_STATUS_KN: Record<string, string> = { answered: "ಉತ್ತರಿಸಲಾಗಿದೆ", partial: "ಭಾಗಶಃ", open: "ಬಾಕಿ" };

export function AIRecommendationCard({
  complaintId,
  recommendation,
  aiConfigured,
}: {
  complaintId: string;
  recommendation: RecommendationRow | null;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const activeRef = React.useRef(true);
  React.useEffect(() => () => { activeRef.current = false; }, []);

  const isAnalyzing = recommendation?.analysis_status === "queued" || recommendation?.analysis_status === "running";
  const action = recommendation?.recommendation_action ?? null;
  const meta = action ? ACTION_META[action] : null;

  async function runOneClickAction(language?: DraftLanguage) {
    if (!action) return;
    setError(null);

    if (action === "upload_evidence" || action === "review") {
      router.push(`/complaints/${complaintId}?tab=documents`);
      return;
    }
    if (action === "close") {
      router.push(`/complaints/${complaintId}?step=close`);
      return;
    }
    // Escalation is done from the workflow's Escalate step (generate → file →
    // record), so send the user there rather than generating in the background.
    if (action === "escalate") {
      router.push(`/complaints/${complaintId}?step=escalate`);
      return;
    }

    const kind =
      action === "generate_reminder" ? "reminder_email"
      : action === "counter_reply" ? "counter_reply"
      : action === "request_clarification" ? "clarification_request"
      : action === "convert_to_rti" ? "rti_from_complaint"
      : null;
    if (!kind) return;

    setBusy(true);
    const start = await startAiDraftJob({ complaintId, kind, language });
    if (!start.ok || !start.jobId) {
      setError(start.error ?? "Could not start generation.");
      setBusy(false);
      return;
    }
    const jobId = start.jobId;
    const poll = async () => {
      if (!activeRef.current) return;
      const r = await getJobAction(jobId);
      const status = r.job?.status;
      if (status === "done") {
        if (action === "generate_reminder") await markReminderGenerated(complaintId);
        setBusy(false);
        router.push(`/complaints/${complaintId}?tab=ai`);
        return;
      }
      if (status === "failed") {
        setError(r.job?.error ?? "Generation failed.");
        setBusy(false);
        return;
      }
      setTimeout(poll, 2500);
    };
    setTimeout(poll, 1500);
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-150 bg-card p-5 shadow-2xs dark:border-slate-850">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-850 pb-3">
        <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-450">
          <Sparkles className="h-4 w-4 text-primary" /> AI ಸಲಹೆಗಾರ (Advisor)
        </div>
        {recommendation && (
          <AIHealthScore score={recommendation.health_score} riskLevel={recommendation.risk_level} compact />
        )}
      </div>

      {!aiConfigured && (
        <p className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-400 font-semibold leading-relaxed">
          <AlertTriangle className="h-4 w-4 shrink-0" /> AI ವಿವರಣೆ ಲಭ್ಯವಿಲ್ಲ — ಶಿಫಾರಸುಗಳನ್ನು ಸಕ್ರಿಯಗೊಳಿಸಲು ANTHROPIC_API_KEY ಹೊಂದಿಸಿ. ಆರೋಗ್ಯ ಸ್ಕೋರ್ ಸ್ವಯಂಚಾಲಿತವಾಗಿ ನವೀಕರಿಸುತ್ತದೆ.
        </p>
      )}

      {isAnalyzing && (
        <p className="flex items-center gap-2 text-xs text-slate-400 font-bold">
          <Loader2 className="h-4 w-4 animate-spin text-primary" /> ವಿಶ್ಲೇಷಿಸಲಾಗುತ್ತಿದೆ…
        </p>
      )}

      {!recommendation && !isAnalyzing && (
        <p className="text-xs text-slate-455 dark:text-slate-500 font-semibold leading-relaxed">ಇನ್ನೂ ವಿಶ್ಲೇಷಿಸಿಲ್ಲ. ಈ ದೂರನ್ನು ಮುಂದಿನ ನವೀಕರಣದಲ್ಲಿ ಸ್ವಯಂಚಾಲಿತವಾಗಿ ವಿಶ್ಲೇಷಿಸಲಾಗುತ್ತದೆ.</p>
      )}

      {recommendation?.current_situation && (
        <div className="space-y-1 pt-1">
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">ಪ್ರಸ್ತುತ ಸ್ಥಿತಿ (Current situation)</p>
          <p className="text-xs font-semibold text-slate-855 dark:text-slate-205 leading-relaxed">{recommendation.current_situation}</p>
        </div>
      )}

      {recommendation?.recommendation && (
        <div className="space-y-2 rounded-xl bg-primary/5 p-4.5 border border-primary/10">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-black uppercase tracking-wider text-primary">ಶಿಫಾರಸು (Recommendation)</p>
            {recommendation.confidence && (
              <span className="text-[10px] font-extrabold text-primary/80">
                {CONFIDENCE_KN[recommendation.confidence] ?? recommendation.confidence}
                {typeof recommendation.confidence_score === "number" ? ` · ${recommendation.confidence_score}%` : ""} ವಿಶ್ವಾಸ
              </span>
            )}
          </div>
          <p className="text-sm font-extrabold text-slate-900 dark:text-slate-100 leading-normal">{recommendation.recommendation}</p>
          {recommendation.reasoning && <p className="text-xs text-slate-550 dark:text-slate-400 leading-relaxed font-semibold">{recommendation.reasoning}</p>}
        </div>
      )}

      {recommendation?.expected_outcome && (
        <div className="space-y-1">
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">ನಿರೀಕ್ಷಿತ ಫಲಿತಾಂಶ (Expected outcome)</p>
          <p className="text-xs text-slate-550 dark:text-slate-400 leading-relaxed font-semibold">{recommendation.expected_outcome}</p>
        </div>
      )}

      {recommendation?.outstanding_issues && recommendation.outstanding_issues.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-400">
            <ListChecks className="h-3.5 w-3.5" /> ಬಾಕಿ ಇರುವ ವಿಷಯಗಳು (Outstanding Issues)
          </p>
          <ul className="space-y-1.5">
            {recommendation.outstanding_issues.map((o, i) => (
              <li key={i} className="flex items-start gap-2 text-xs font-semibold leading-relaxed">
                <span
                  className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                    o.status === "answered"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : o.status === "partial"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                        : "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                  }`}
                >
                  {ISSUE_STATUS_KN[o.status] ?? o.status}
                </span>
                <span className="text-slate-800 dark:text-slate-205">{o.issue}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="flex items-center gap-1.5 text-xs text-destructive font-semibold"><AlertTriangle className="h-3.5 w-3.5" /> {error}</p>}

      {meta?.buttonLabel && action && (
        GENERATE_ACTIONS.has(action) ? (
          // Draft-producing actions ask which language ("ask each time").
          <LanguageChoiceButton
            size="sm"
            className="w-full h-9 font-bold bg-primary text-primary-foreground hover:bg-primary/95 shadow-xs hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
            busy={busy}
            icon={meta.icon}
            onChoose={(language) => runOneClickAction(language)}
          >
            {meta.buttonLabel}
          </LanguageChoiceButton>
        ) : (
          // Navigation actions (review, upload evidence, escalate, close) — no draft, no prompt.
          <Button size="sm" className="w-full h-9 font-bold bg-primary text-primary-foreground hover:bg-primary/95 shadow-xs hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer" disabled={busy} onClick={() => runOneClickAction()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <meta.icon className="h-4 w-4" />}
            {meta.buttonLabel}
            {!busy && <ArrowRight className="ml-auto h-3.5 w-3.5" />}
          </Button>
        )
      )}

      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold leading-normal pt-2 border-t border-slate-100 dark:border-slate-850">ಇದು ಕೇವಲ ಸಲಹೆ — ಕರಡುಗಳನ್ನು ಸಂಪಾದಿಸಬಹುದು ಮತ್ತು ಎಂದಿಗೂ ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಕಳುಹಿಸಲಾಗುವುದಿಲ್ಲ. ನಿರ್ಧಾರ ಯಾವಾಗಲೂ ನಿಮ್ಮದೇ.</p>
    </div>
  );
}
