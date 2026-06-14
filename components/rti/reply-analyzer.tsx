"use client";

import * as React from "react";
import { Loader2, Sparkles, AlertTriangle } from "lucide-react";
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
import { analyzeRtiReply, type ReplyAnalysisResult } from "@/lib/actions/ai";
import type { RtiWithRelations } from "@/lib/types";

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted" | "outline"> = {
  Answered: "success",
  "Partially answered": "warning",
  "Not answered": "destructive",
  Denied: "destructive",
  Irrelevant: "muted",
  "Needs clarification": "warning",
};

export function ReplyAnalyzer({
  rti,
  aiConfigured,
}: {
  rti: RtiWithRelations;
  aiConfigured: boolean;
}) {
  const [questions, setQuestions] = React.useState(rti.info_requested ?? "");
  const [replyText, setReplyText] = React.useState(rti.reply_summary ?? "");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ReplyAnalysisResult | null>(null);

  async function analyze() {
    setBusy(true);
    setResult(null);
    try {
      const qs = questions.split("\n").map((q) => q.trim()).filter(Boolean);
      const r = await analyzeRtiReply({ questions: qs, replyText });
      setResult(r);
    } finally {
      setBusy(false);
    }
  }

  if (!aiConfigured) {
    return (
      <div className="rounded-md border border-amber/40 bg-amber/5 p-4 text-sm text-amber-dark">
        <AlertTriangle className="mb-1 h-5 w-5" />
        <p className="font-semibold">AI not configured</p>
        <p className="mt-1">
          The reply analyzer needs an AI provider. Set{" "}
          <code className="rounded bg-muted px-1">ANTHROPIC_API_KEY</code> to enable it.
          You can still record the reply summary and draft a first appeal manually.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Original questions (one per line)</Label>
          <Textarea value={questions} onChange={(e) => setQuestions(e.target.value)} rows={8} />
        </div>
        <div className="space-y-1.5">
          <Label>PIO reply text</Label>
          <Textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            rows={8}
            placeholder="Paste the full text of the PIO's reply here…"
          />
        </div>
      </div>
      <Button onClick={analyze} disabled={busy || !replyText.trim()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        Analyze reply
      </Button>

      {result?.error && !result.analysis && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
          {result.error}
        </div>
      )}

      {result?.analysis && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant={result.analysis.overall.complete ? "success" : "destructive"}>
              {result.analysis.overall.complete ? "Reply complete" : "Reply incomplete"}
            </Badge>
            {result.analysis.overall.exemptionCited && <Badge variant="warning">Exemption cited</Badge>}
            {result.analysis.overall.extraFeeDemanded && <Badge variant="warning">Extra fee demanded</Badge>}
            {result.analysis.overall.delayed && <Badge variant="warning">Delayed</Badge>}
            {result.analysis.overall.firstAppealRecommended && (
              <Badge variant="destructive">First appeal recommended</Badge>
            )}
          </div>
          {result.analysis.overall.summary && (
            <p className="text-sm text-muted-foreground">{result.analysis.overall.summary}</p>
          )}
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Question</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Suggested appeal ground</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.analysis.items.map((it, i) => (
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
            ⚠ AI assessment — review against the actual reply before filing an appeal.
          </div>
        </div>
      )}
    </div>
  );
}
