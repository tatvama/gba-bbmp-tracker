"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  getComplaintAiRecommendationAction,
  triggerAdvisorAnalysis,
  setAdvisorLanguageAction,
} from "@/lib/actions/ai-advisor";
import type { AdvisorLanguage, RecommendationRow } from "@/lib/ai/advisor/types";
import { AIRecommendationCard } from "./AIRecommendationCard";

/** A 'running'/'queued' row older than this is treated as a dead lock to recover. */
const STALE_MS = 120_000;

/** Flatten every human-readable text field on a recommendation row into one string. */
function allText(r: RecommendationRow): string {
  return [
    r.current_situation, r.reasoning, r.expected_outcome, r.timeline_summary, r.recommendation,
    ...r.missing_information, ...r.detected_risks,
    ...r.outstanding_issues.map((o) => o.issue),
    ...r.contradictions.flatMap((c) => [c.summary, c.conflictsWith]),
    ...r.commitments.map((m) => m.commitment),
  ].filter(Boolean).join(" ");
}

/**
 * Sticky AI insights panel for the complaint detail page. Receives the
 * server-fetched initial recommendation as a prop (no extra round-trip on first
 * paint), then:
 *  - polls every 4s the WHOLE time it's open, so an analysis triggered by ANY
 *    later action — uploading a reply, filing a counter-reply, an edit — is
 *    reflected within a few seconds (React ignores prop changes after mount, so
 *    a one-shot / in-flight-only poll would miss these);
 *  - on open, kicks a fresh analysis if the row is missing (never analysed) or
 *    stuck in a stale in-flight lock (a prior run died mid-flight); and
 *  - offers an English/Kannada toggle. The advisor's narrative is cached per
 *    language, so switching to a language already generated for the current
 *    case-state is instant (no AI call); otherwise it regenerates in the
 *    background and the poll picks it up. Default is Kannada.
 */
export function AIInsightsPanel({
  complaintId,
  initialRecommendation,
  aiConfigured,
  priority,
}: {
  complaintId: string;
  initialRecommendation: RecommendationRow | null;
  aiConfigured: boolean;
  priority?: string | null;
}) {
  const [recommendation, setRecommendation] = React.useState(initialRecommendation);
  const [viewLang, setViewLang] = React.useState<AdvisorLanguage>(
    initialRecommendation?.narrative_language === "en" ? "en" : "kn",
  );
  const [switching, setSwitching] = React.useState(false);
  const activeRef = React.useRef(true);
  React.useEffect(() => () => { activeRef.current = false; }, []);

  const refresh = React.useCallback(async () => {
    const fresh = await getComplaintAiRecommendationAction(complaintId);
    if (activeRef.current && fresh) setRecommendation(fresh);
  }, [complaintId]);

  // Poll for the whole time the panel is open. The row is a single indexed
  // read, so a 4s cadence is cheap, and it's the only reliable way to catch an
  // analysis kicked off elsewhere (e.g. a reply uploaded in the workflow panel)
  // since this client component won't see the refreshed server prop.
  React.useEffect(() => {
    const id = setInterval(() => void refresh(), 4000);
    return () => clearInterval(id);
  }, [refresh]);

  // Switch the advisor's display language. Optimistically flip the toggle, then
  // ask the server to promote the cached narrative (instant) or kick a
  // background regeneration (the poll reflects it). Kannada default is never
  // fought by the mount effect below because that only self-heals toward the
  // language the panel is currently showing.
  const switchLang = React.useCallback(async (lang: AdvisorLanguage) => {
    setViewLang(lang);
    if (!aiConfigured) return;
    setSwitching(true);
    try {
      const row = await setAdvisorLanguageAction(complaintId, lang);
      if (activeRef.current && row) setRecommendation(row);
    } finally {
      if (activeRef.current) setSwitching(false);
    }
  }, [aiConfigured, complaintId]);

  // On mount: recover a missing or stale-stuck analysis, OR self-heal a stored
  // narrative that doesn't match the language currently shown (e.g. a legacy
  // pre-switch row that predates Kannada, or one using Kannada-script digits).
  // The self-heal only ever targets the CURRENTLY-SHOWN language (viewLang at
  // mount = the row's stored language, default Kannada), so it never overrides a
  // user's explicit later toggle. Fires at most once per mount (kickedRef).
  const kickedRef = React.useRef(false);
  React.useEffect(() => {
    if (kickedRef.current) return;
    const r = recommendation;
    const inFlight = r?.analysis_status === "queued" || r?.analysis_status === "running";
    const stale = !r?.updated_at || Date.now() - Date.parse(r.updated_at) > STALE_MS;
    const text = r ? allText(r) : "";
    const hasKannada = /[ಀ-೿]/.test(text);
    const hasKannadaDigits = /[೦-೯]/.test(text);
    // Text doesn't match the shown language, or (Kannada only) uses script digits.
    const mismatched = !!text && (viewLang === "kn" ? !hasKannada || hasKannadaDigits : hasKannada);
    if (!r || (inFlight && stale) || mismatched) {
      kickedRef.current = true;
      void triggerAdvisorAnalysis(complaintId, viewLang).then(refresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

  const langMismatch = recommendation?.narrative_language && recommendation.narrative_language !== viewLang;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <div className="inline-flex items-center rounded-md border border-slate-200 p-0.5 text-[11px] font-bold dark:border-slate-800" role="group" aria-label="Advisor language">
          {(["kn", "en"] as AdvisorLanguage[]).map((l) => (
            <button
              key={l}
              type="button"
              disabled={!aiConfigured || switching}
              aria-pressed={viewLang === l}
              onClick={() => void switchLang(l)}
              className={cn(
                "rounded px-2.5 py-1 transition-colors disabled:opacity-50",
                viewLang === l
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {l === "kn" ? "ಕನ್ನಡ" : "English"}
            </button>
          ))}
        </div>
      </div>
      <AIRecommendationCard
        complaintId={complaintId}
        recommendation={langMismatch ? { ...recommendation!, analysis_status: "running" } : recommendation}
        aiConfigured={aiConfigured}
        priority={priority}
        lang={viewLang}
      />
    </div>
  );
}
