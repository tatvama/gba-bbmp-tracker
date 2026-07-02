"use client";

import * as React from "react";
import { getComplaintAiRecommendationAction } from "@/lib/actions/ai-advisor";
import type { RecommendationRow } from "@/lib/ai/advisor/types";
import { AIRecommendationCard } from "./AIRecommendationCard";
import { AITimelineInsight } from "./AITimelineInsight";

/**
 * Sticky AI insights panel for the complaint detail page. Receives the
 * server-fetched initial recommendation as a prop (no extra round-trip on
 * first paint); polls for updates while analysis is in flight (queued/running)
 * so the panel picks up a fresh result without a full page reload.
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

  React.useEffect(() => {
    const inFlight = recommendation?.analysis_status === "queued" || recommendation?.analysis_status === "running";
    if (!inFlight) return;
    const t = setTimeout(async () => {
      if (!activeRef.current) return;
      const fresh = await getComplaintAiRecommendationAction(complaintId);
      if (activeRef.current && fresh) setRecommendation(fresh);
    }, 3000);
    return () => clearTimeout(t);
  }, [recommendation?.analysis_status, complaintId]);

  return (
    <div className="space-y-3">
      <AIRecommendationCard complaintId={complaintId} recommendation={recommendation} aiConfigured={aiConfigured} />
      <AITimelineInsight recommendation={recommendation} />
    </div>
  );
}
