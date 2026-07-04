"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Sparkles, Loader2, AlertTriangle, ArrowRight, Bell, Gavel, MessageSquareReply,
  Camera, CircleCheck, Clock, Search, HelpCircle, ListChecks, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LanguageChoiceButton } from "@/components/complaints/language-choice-button";
import { startAiDraftJob, getJobAction } from "@/lib/actions/jobs";
import { markReminderGenerated } from "@/lib/actions/ai-advisor";
import { openDraftPdf } from "@/lib/print-letter";
import { formatDateTime } from "@/lib/format";
import type { DraftLanguage } from "@/lib/constants";
import type { RecommendationRow, RecommendationAction } from "@/lib/ai/advisor/types";
import { AIHealthScore } from "./AIHealthScore";
import { AITimelineInsight } from "./AITimelineInsight";

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
  priority,
}: {
  complaintId: string;
  recommendation: RecommendationRow | null;
  aiConfigured: boolean;
  priority?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isOpen, setIsOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const activeRef = React.useRef(true);

  React.useEffect(() => {
    setMounted(true);
    return () => { activeRef.current = false; };
  }, []);

  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

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
      {/* 1. Header (Common) */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-850 pb-3">
        <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-450 select-none">
          <Sparkles className="h-4 w-4 text-primary" /> AI ಸಲಹೆಗಾರ (Advisor)
        </div>
        {recommendation && (
          <AIHealthScore score={recommendation.health_score} riskLevel={recommendation.risk_level} compact />
        )}
      </div>

      {/* 2. Metadata (Mobile/Tablet Only) */}
      {recommendation && (
        <div className="flex flex-wrap items-center gap-2 pt-1 lg:hidden text-xs select-none">
          {recommendation.confidence && (
            <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-bold border-primary/20 bg-primary/5 text-primary">
              {CONFIDENCE_KN[recommendation.confidence] ?? recommendation.confidence} ವಿಶ್ವಾಸ (Confidence)
            </Badge>
          )}
          {priority && (
            <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-bold border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-450">
              {priority} Priority
            </Badge>
          )}
          {recommendation.updated_at && (
            <span className="text-[10px] text-muted-foreground font-medium ml-auto">
              Updated {formatDateTime(recommendation.updated_at)}
            </span>
          )}
        </div>
      )}

      {/* 3. Banner Warnings / Status Indicators (Common) */}
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

      {/* 4. Desktop-only full inline view (>= 1024px) */}
      <div className="space-y-4 lg:block hidden">
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
            <Button size="sm" className="w-full h-9 font-bold bg-primary text-primary-foreground hover:bg-primary/95 shadow-xs hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer" disabled={busy} onClick={() => runOneClickAction()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <meta.icon className="h-4 w-4" />}
              {meta.buttonLabel}
              {!busy && <ArrowRight className="ml-auto h-3.5 w-3.5" />}
            </Button>
          )
        )}
      </div>

      {/* 5. Mobile & Tablet preview layout (< 1024px) */}
      {recommendation && (
        <div className="lg:hidden block space-y-3">
          <div className="relative">
            <div className="line-clamp-4 md:line-clamp-8 text-xs font-semibold text-slate-800 dark:text-slate-200 leading-relaxed space-y-2 select-none">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1">ಶಿಫಾರಸು (Recommendation):</p>
                <p className="font-extrabold text-slate-900 dark:text-slate-100">{recommendation.recommendation}</p>
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1">ಪ್ರಸ್ತುತ ಸ್ಥಿತಿ (Current situation):</p>
                <p className="text-slate-600 dark:text-slate-450 font-semibold">{recommendation.current_situation}</p>
              </div>
            </div>
            {/* Fade overlay */}
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-card to-transparent" />
          </div>

          <Button
            size="sm"
            variant="outline"
            className="w-full h-9 font-bold text-xs bg-muted/30 hover:bg-muted/70 transition-all border-slate-200 dark:border-slate-800"
            onClick={() => setIsOpen(true)}
          >
            Read Full Advisory / ಪೂರ್ಣ ವಿವರ ನೋಡಿ
          </Button>
        </div>
      )}

      {/* 6. Legal disclaimer footer */}
      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold leading-normal pt-2 border-t border-slate-100 dark:border-slate-850 select-none">ಇದು ಕೇವಲ ಸಲಹೆ — ಕರಡುಗಳನ್ನು ಸಂಪಾದಿಸಬಹುದು ಮತ್ತು ಎಂದಿಗೂ ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಕಳುಹಿಸಲಾಗುವುದಿಲ್ಲ. ನಿರ್ಧಾರ ಯಾವಾಗಲೂ ನಿಮ್ಮದೇ.</p>

      {/* 7. Modal Component rendered via Portal */}
      {isOpen && mounted && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-xs select-none"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div
            tabIndex={-1}
            className="outline-none flex flex-col bg-card w-full h-full md:h-[85vh] md:max-h-[90vh] md:w-[90%] lg:w-[75%] max-w-4xl md:rounded-xl border border-slate-150 dark:border-slate-850 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          >
            {/* Swipe Pill for Mobile */}
            <div className="flex md:hidden justify-center pt-2.5 pb-1 bg-muted/20">
              <div className="w-12 h-1 bg-slate-350 dark:bg-slate-700 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between border-b px-5 py-4 dark:border-slate-850">
              <div className="flex items-center gap-2 font-black uppercase text-xs tracking-wider text-slate-800 dark:text-slate-200 animate-pulse" id="modal-title">
                <Sparkles className="h-4 w-4 text-primary" /> AI ಸಲಹೆಗಾರ (AI Advisory)
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-md p-1.5 hover:bg-muted text-muted-foreground transition-colors"
                aria-label="Close modal"
              >
                <span className="text-sm font-bold">✕</span>
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 select-text">
              {/* Health Score / Risk */}
              {recommendation && (
                <div className="flex items-center justify-between gap-2 border-b dark:border-slate-850 pb-3">
                  <span className="text-xs font-bold text-muted-foreground">ಆರೋಗ್ಯ ಸ್ಕೋರ್ (Health Score):</span>
                  <AIHealthScore score={recommendation.health_score} riskLevel={recommendation.risk_level} />
                </div>
              )}

              {/* Current Situation */}
              {recommendation?.current_situation && (
                <div className="space-y-1">
                  <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">ಪ್ರಸ್ತುತ ಸ್ಥಿತಿ (Current situation)</p>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-relaxed">{recommendation.current_situation}</p>
                </div>
              )}

              {/* Recommendation */}
              {recommendation?.recommendation && (
                <div className="space-y-2 rounded-xl bg-primary/5 p-4 border border-primary/10">
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
                  {recommendation.reasoning && <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">{recommendation.reasoning}</p>}
                </div>
              )}

              {/* Expected Outcome */}
              {recommendation?.expected_outcome && (
                <div className="space-y-1">
                  <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">ನಿರೀಕ್ಷಿತ ಫಲಿತಾಂಶ (Expected outcome)</p>
                  <p className="text-xs text-slate-550 dark:text-slate-400 leading-relaxed font-semibold">{recommendation.expected_outcome}</p>
                </div>
              )}

              {/* Outstanding Issues */}
              {recommendation?.outstanding_issues && recommendation.outstanding_issues.length > 0 && (
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-400">
                    <ListChecks className="h-3.5 w-3.5" /> ಬಾಕಿ ಇರುವ ವಿಷಯಗಳು (Outstanding Issues)
                  </p>
                  <ul className="space-y-1.5">
                    {recommendation.outstanding_issues.map((o, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs font-semibold leading-relaxed">
                        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                          o.status === "answered" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" :
                          o.status === "partial" ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" :
                          "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                        }`}>
                          {ISSUE_STATUS_KN[o.status] ?? o.status}
                        </span>
                        <span className="text-slate-800 dark:text-slate-205">{o.issue}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Timeline summary / contradictions / commitments / risks */}
              <div className="pt-4 border-t dark:border-slate-850">
                <AITimelineInsight recommendation={recommendation} />
              </div>

              {/* Action trigger button inside modal */}
              {meta?.buttonLabel && action && (
                <div className="pt-4 border-t dark:border-slate-850">
                  {GENERATE_ACTIONS.has(action) ? (
                    <LanguageChoiceButton
                      size="sm"
                      className="w-full h-10 font-bold bg-primary text-primary-foreground hover:bg-primary/95 shadow-xs"
                      busy={busy}
                      icon={meta.icon}
                      onChoose={(language) => {
                        runOneClickAction(language);
                        setIsOpen(false);
                      }}
                    >
                      {meta.buttonLabel}
                    </LanguageChoiceButton>
                  ) : (
                    <Button size="sm" className="w-full h-10 font-bold bg-primary text-primary-foreground hover:bg-primary/95 shadow-xs" disabled={busy} onClick={() => {
                      runOneClickAction();
                      setIsOpen(false);
                    }}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <meta.icon className="h-4 w-4" />}
                      {meta.buttonLabel}
                      {!busy && <ArrowRight className="ml-auto h-3.5 w-3.5" />}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 bg-muted/30 dark:border-slate-850">
              <Button variant="ghost" onClick={() => setIsOpen(false)} className="font-bold text-xs">
                Close / ಮುಚ್ಚಿ
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => {
                  if (!recommendation) return;
                  const copyText = `AI Advisory / AI ಸಲಹೆಗಾರ
Current Situation: ${recommendation.current_situation ?? ""}
Recommendation: ${recommendation.recommendation ?? ""}
Expected Outcome: ${recommendation.expected_outcome ?? ""}`;
                  navigator.clipboard.writeText(copyText);
                  alert("Advisory copied to clipboard / ಕ್ಲಿಪ್‌ಬೋರ್ಡ್‌ಗೆ ನಕಲಿಸಲಾಗಿದೆ!");
                }} className="text-xs font-bold gap-1">
                  Copy / ನಕಲಿಸಿ
                </Button>
                <Button variant="outline" size="sm" onClick={async () => {
                  if (!recommendation) return;
                  const printText = `AI Advisory / AI ಸಲಹೆಗಾರ\n\n**Current Situation / ಪ್ರಸ್ತುತ ಸ್ಥಿತಿ:**\n${recommendation.current_situation ?? ""}\n\n**Recommendation / ಶಿಫಾರಸು:**\n${recommendation.recommendation ?? ""}\n${recommendation.reasoning ?? ""}\n\n**Expected Outcome / ನಿರೀಕ್ಷಿತ ಫಲಿತಾಂಶ:**\n${recommendation.expected_outcome ?? ""}`;
                  await openDraftPdf("AI_Advisory", printText);
                }} className="text-xs font-bold gap-1">
                  Print / ಮುದ್ರಿಸಿ
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
