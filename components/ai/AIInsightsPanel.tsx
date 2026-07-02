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
 *  - polls every 4s the WHOLE time it's open, so an analysis triggered by ANY
 *    later action — uploading a reply, filing a counter-reply, an edit — is
 *    reflected within a few seconds (React ignores prop changes after mount, so
 *    a one-shot / in-flight-only poll would miss these); and
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
