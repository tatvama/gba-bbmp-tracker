"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles, Loader2, AlertTriangle, ArrowRight, Bell, Gavel, MessageSquareReply,
  Camera, CircleCheck, Clock, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { startAiDraftJob, getJobAction } from "@/lib/actions/jobs";
import { markReminderGenerated, markEscalationGenerated } from "@/lib/actions/ai-advisor";
import type { RecommendationRow, RecommendationAction } from "@/lib/ai/advisor/types";
import { AIHealthScore } from "./AIHealthScore";

const ACTION_META: Record<
  RecommendationAction,
  { icon: React.ComponentType<{ className?: string }>; buttonLabel: string | null }
> = {
  generate_reminder: { icon: Bell, buttonLabel: "Generate reminder letter" },
  escalate: { icon: Gavel, buttonLabel: "Draft escalation letter" },
  counter_reply: { icon: MessageSquareReply, buttonLabel: "Draft counter-reply" },
  upload_evidence: { icon: Camera, buttonLabel: "Go to documents" },
  review: { icon: Search, buttonLabel: "Review documents" },
  close: { icon: CircleCheck, buttonLabel: "Go to case overview" },
  wait: { icon: Clock, buttonLabel: null },
  none: { icon: CircleCheck, buttonLabel: null },
};

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

  async function runOneClickAction() {
    if (!action) return;
    setError(null);

    if (action === "upload_evidence" || action === "review") {
      router.push(`/complaints/${complaintId}?tab=documents`);
      return;
    }
    if (action === "close") {
      router.push(`/complaints/${complaintId}?tab=overview`);
      return;
    }

    const kind = action === "generate_reminder" ? "reminder_email" : action === "escalate" ? "escalation_letter" : action === "counter_reply" ? "counter_reply" : null;
    if (!kind) return;

    setBusy(true);
    const start = await startAiDraftJob({ complaintId, kind });
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
        if (action === "escalate") await markEscalationGenerated(complaintId);
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
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> AI Advisor
        </div>
        {recommendation && (
          <AIHealthScore score={recommendation.health_score} riskLevel={recommendation.risk_level} compact />
        )}
      </div>

      {!aiConfigured && (
        <p className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> AI narrative unavailable — set ANTHROPIC_API_KEY to enable recommendations. Health score still updates automatically.
        </p>
      )}

      {isAnalyzing && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analysing…
        </p>
      )}

      {!recommendation && !isAnalyzing && (
        <p className="text-xs text-muted-foreground">Not yet analysed. This complaint will be analysed automatically on its next update.</p>
      )}

      {recommendation?.current_situation && (
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Current situation</p>
          <p className="text-sm">{recommendation.current_situation}</p>
        </div>
      )}

      {recommendation?.recommendation && (
        <div className="space-y-1 rounded-md bg-primary/5 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-primary">Recommendation</p>
            {recommendation.confidence && (
              <span className="text-[10px] font-semibold text-muted-foreground">{recommendation.confidence} confidence</span>
            )}
          </div>
          <p className="text-sm font-semibold">{recommendation.recommendation}</p>
          {recommendation.reasoning && <p className="text-xs text-muted-foreground">{recommendation.reasoning}</p>}
        </div>
      )}

      {recommendation?.expected_outcome && (
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Expected outcome</p>
          <p className="text-xs text-muted-foreground">{recommendation.expected_outcome}</p>
        </div>
      )}

      {error && <p className="flex items-center gap-1.5 text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> {error}</p>}

      {meta?.buttonLabel && (
        <Button size="sm" className="w-full" disabled={busy} onClick={runOneClickAction}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <meta.icon className="h-4 w-4" />}
          {meta.buttonLabel}
          {!busy && <ArrowRight className="ml-auto h-3.5 w-3.5" />}
        </Button>
      )}

      <p className="text-[10px] text-muted-foreground">Advisory only — drafts are editable and never sent automatically. You always decide.</p>
    </div>
  );
}
