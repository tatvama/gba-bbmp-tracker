"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Sparkles, AlertTriangle, Scale, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { analyzeRtiReplyFromDocuments, type ReplyAnalysisResult } from "@/lib/actions/ai";

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted" | "outline"> = {
  Answered: "success",
  "Partially answered": "warning",
  "Not answered": "destructive",
  Denied: "destructive",
  Irrelevant: "muted",
  "Needs clarification": "warning",
};

const selectCls =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface Stage {
  panelLabel: string;
  responseLabel: string;
  escalationLabel: string;
  recommendText: string;
  next: { label: string; href: string } | null;
}

const OTHER_STAGE: Stage = {
  panelLabel: "Response document",
  responseLabel: "response document",
  escalationLabel: "",
  recommendText: "Response is deficient — review for the appropriate remedy",
  next: null,
};

const STAGES: Record<string, Stage> = {
  Reply: {
    panelLabel: "PIO reply — answers received",
    responseLabel: "Public Information Officer (PIO) reply",
    escalationLabel: "first appeal",
    recommendText: "First appeal recommended — the PIO's reply is deficient",
    next: { label: "Draft first appeal", href: "first-appeal" },
  },
  "FAA Order": {
    panelLabel: "FAA order — first-appeal decision",
    responseLabel: "First Appellate Authority (FAA) order",
    escalationLabel: "second appeal",
    recommendText: "Second appeal recommended — the FAA order is unsatisfactory",
    next: { label: "Draft second appeal", href: "second-appeal" },
  },
  "Second Appeal Order": {
    panelLabel: "Information Commission order",
    responseLabel: "Information Commission order (second appeal)",
    escalationLabel: "higher appeal / writ petition",
    recommendText:
      "higher appeal / writ petition recommended — the Information Commission order is unsatisfactory. File a Writ Petition before the Karnataka High Court under Article 226/227 of the Constitution.",
    next: null,
  },
  "Higher Appeal Order": {
    panelLabel: "Higher appeal order — writ petition / HC decision",
    responseLabel: "higher appeal order",
    escalationLabel: "",
    recommendText:
      "High Court order is final under RTI — no further statutory remedy. A Special Leave Petition (SLP) before the Supreme Court may be considered if the order involves a substantial question of law.",
    next: null,
  },
  Other: OTHER_STAGE,
};

const RESPONSE_TYPES = ["Reply", "FAA Order", "Second Appeal Order", "Higher Appeal Order", "Other"];

export function ReplyAnalyzer({
  rtiId,
  aiConfigured,
  applicationText,
  applicationSource,
  responseTextByType,
  responseCounts,
  defaultType,
}: {
  rtiId: string;
  aiConfigured: boolean;
  applicationText: string;
  applicationSource: string | null;
  responseTextByType: Record<string, string>;
  responseCounts: Record<string, number>;
  defaultType: string;
}) {
  const [questions, setQuestions] = React.useState(applicationText);
  const [selectedType, setSelectedType] = React.useState(defaultType);
  const [responseText, setResponseText] = React.useState(responseTextByType[defaultType] ?? "");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ReplyAnalysisResult | null>(null);
  const autoRan = React.useRef(false);

  const runAnalyze = React.useCallback(
    async (appText: string, respText: string, stageKey: string) => {
      const stage = STAGES[stageKey] ?? OTHER_STAGE;
      setBusy(true);
      setResult(null);
      try {
        const r = await analyzeRtiReplyFromDocuments({
          applicationText: appText,
          replyText: respText,
          responseLabel: stage.responseLabel,
          escalationLabel: stage.escalationLabel,
        });
        setResult(r);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  // Auto-run once when both texts are already available from the documents.
  React.useEffect(() => {
    if (!autoRan.current && aiConfigured && responseText.trim() && questions.trim()) {
      autoRan.current = true;
      void runAnalyze(questions, responseText, selectedType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeType(t: string) {
    const text = responseTextByType[t] ?? "";
    setSelectedType(t);
    setResponseText(text);
    setResult(null);
    if (aiConfigured && text.trim() && questions.trim()) {
      void runAnalyze(questions, text, t);
    }
  }

  if (!aiConfigured) {
    return (
      <div className="rounded-md border border-amber/40 bg-amber/5 p-4 text-sm text-amber-dark">
        <AlertTriangle className="mb-1 h-5 w-5" />
        <p className="font-semibold">AI not configured</p>
        <p className="mt-1">
          The analyzer needs an AI provider. Set{" "}
          <code className="rounded bg-muted px-1">ANTHROPIC_API_KEY</code> to enable it. You can
          still read the documents and draft an appeal manually.
        </p>
      </div>
    );
  }

  const stage = STAGES[selectedType] ?? OTHER_STAGE;
  const items = result?.analysis?.items ?? [];
  const answered = items.filter((it) => it.status === "Answered").length;
  const overall = result?.analysis?.overall;
  const deficient = !!overall?.firstAppealRecommended;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          Application source: <span className="font-medium">{applicationSource ?? "none found"}</span>
        </span>
      </div>

      {!responseText.trim() && (
        <div className="rounded-md border border-amber/40 bg-amber/5 p-3 text-sm text-amber-dark">
          <AlertTriangle className="mb-1 inline h-4 w-4" /> No “{selectedType}” document found yet.
          Upload it on the RTI page, or paste the text below.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          <Label>RTI application — questions asked</Label>
          <Textarea value={questions} onChange={(e) => setQuestions(e.target.value)} rows={11} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label>Response to analyze</Label>
            <select
              className={`${selectCls} max-w-[12rem]`}
              value={selectedType}
              onChange={(e) => changeType(e.target.value)}
              aria-label="Response document type"
            >
              {RESPONSE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t} ({responseCounts[t] ?? 0})
                </option>
              ))}
            </select>
          </div>
          <Textarea
            value={responseText}
            onChange={(e) => setResponseText(e.target.value)}
            rows={11}
            placeholder={`${stage.panelLabel} — text appears here, or paste it.`}
          />
        </div>
      </div>

      <Button onClick={() => runAnalyze(questions, responseText, selectedType)} disabled={busy || !responseText.trim()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        Compare &amp; analyze
      </Button>

      {result?.error && !result.analysis && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
          {result.error}
        </div>
      )}

      {result?.analysis && (
        <div className="space-y-4">
          {/* Verdict + next-step recommendation (stage-aware) */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2">
              {deficient ? (
                <Scale className="h-5 w-5 text-destructive" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              )}
              <span className="text-base font-semibold">
                {deficient ? stage.recommendText : `${selectedType} appears complete — no escalation needed`}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {answered} of {items.length} point{items.length === 1 ? "" : "s"} fully answered.
              {overall?.summary ? ` ${overall.summary}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {overall?.exemptionCited && <Badge variant="warning">Exemption cited</Badge>}
              {overall?.extraFeeDemanded && <Badge variant="warning">Extra fee demanded</Badge>}
              {overall?.delayed && <Badge variant="warning">Delayed</Badge>}
            </div>
            {deficient && stage.next && (
              <Button asChild size="sm" className="mt-3">
                <Link href={`/rti/${rtiId}/${stage.next.href}`}>
                  <Scale className="h-4 w-4" /> {stage.next.label}
                </Link>
              </Button>
            )}
          </div>

          {/* Per-question breakdown */}
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Question</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Suggested ground</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it, i) => (
                  <TableRow key={i}>
                    <TableCell className="max-w-xs align-top text-sm">{it.question}</TableCell>
                    <TableCell className="align-top">
                      <Badge variant={STATUS_VARIANT[it.status] ?? "outline"}>{it.status}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs align-top text-sm text-muted-foreground">
                      {it.appealGround || "—"}
                    </TableCell>
                    <TableCell className="max-w-xs align-top text-xs text-muted-foreground">
                      {it.notes || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="rounded-md border border-amber/50 bg-amber/5 px-3 py-1.5 text-xs font-medium text-amber-dark">
            ⚠ AI assessment — review against the actual document before filing an appeal.
          </div>
        </div>
      )}
    </div>
  );
}
