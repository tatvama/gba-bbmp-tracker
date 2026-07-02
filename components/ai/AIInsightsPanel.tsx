"use client";

import * as React from "react";
import { getComplaintAiRecommendationAction, triggerAdvisorAnalysis } from "@/lib/actions/ai-advisor";
import type { RecommendationRow } from "@/lib/ai/advisor/types";
import { AIRecommendationCard } from "./AIRecommendationCard";
import { AITimelineInsight } from "./AITimelineInsight";

/** A 'running'/'queued' row older than this is treated as a dead lock to recover. */
const STALE_MS = 120_000;

/**
 * Sticky AI insights panel for the complaint detail page. Receives the
 * server-fetched initial recommendation as a prop (no extra round-trip on first
 * paint), then:
 *  - polls every 3s WHILE an analysis is in flight, so a long deep pass (which
 *    can take 15–40s) is picked up whenever it finishes — not just once; and
 *  - on open, kicks a fresh analysis if the row is missing (never analysed) or
 *    stuck in a stale in-flight lock (a prior run died mid-flight), so the panel
 *    never spins on "Analysing…" forever.
 */
export function AIInsightsPanel({
  complaintId,
  initialRecommendation,
  aiConfigured,
}: {
  complaintId: string;
  initialRecommendation: RecommendationRow | null;
  aiConfigured: boolean;
}) {
  const [recommendation, setRecommendation] = React.useState(initialRecommendation);
  const activeRef = React.useRef(true);
  const statusRef = React.useRef(recommendation?.analysis_status);
  statusRef.current = recommendation?.analysis_status;
  React.useEffect(() => () => { activeRef.current = false; }, []);

  const refresh = React.useCallback(async () => {
    const fresh = await getComplaintAiRecommendationAction(complaintId);
    if (activeRef.current && fresh) setRecommendation(fresh);
  }, [complaintId]);

  // Poll only while an analysis is in flight (ref-guarded so it keeps ticking
  // across a long run, and re-engages if a later re-trigger flips the status
  // back to running — one cheap status check every 3s otherwise).
  React.useEffect(() => {
    const id = setInterval(() => {
      if (statusRef.current === "queued" || statusRef.current === "running") void refresh();
    }, 3000);
    return () => clearInterval(id);
  }, [refresh]);

  // On mount: recover a missing or stale-stuck analysis. The backend
  // single-flight + context-hash gate make a redundant kick cheap, and it only
  // reclaims a lock that's actually dead (see STALE_LOCK_MS in the engine).
  const kickedRef = React.useRef(false);
  React.useEffect(() => {
    if (kickedRef.current) return;
    const r = recommendation;
    const inFlight = r?.analysis_status === "queued" || r?.analysis_status === "running";
    const stale = !r?.updated_at || Date.now() - Date.parse(r.updated_at) > STALE_MS;
    if (!r || (inFlight && stale)) {
      kickedRef.current = true;
      void triggerAdvisorAnalysis(complaintId).then(refresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <AIRecommendationCard complaintId={complaintId} recommendation={recommendation} aiConfigured={aiConfigured} />
      <AITimelineInsight recommendation={recommendation} />
    </div>
  );
}
