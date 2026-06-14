"use client";

import * as React from "react";
import { Loader2, AlertTriangle, ScanSearch, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiDraftPanel } from "@/components/rti/ai-draft-panel";
import {
  analyzeRoadWorkReply,
  generateRoadWorkEscalation,
  type RoadWorkReplyAnalysis,
} from "@/lib/actions/ai";
import type { RoadWorkLanguage, RoadWorkOutputType } from "@/lib/ai/road-work-knowledge";

function statusVariant(s: string): "success" | "warning" | "destructive" | "muted" {
  if (s === "Answered") return "success";
  if (s === "Partial") return "warning";
  if (s === "Dodged" || s === "Denied" || s === "Not addressed") return "destructive";
  return "muted";
}

export function RoadWorkReplyAnalyzer({ aiConfigured }: { aiConfigured: boolean }) {
  const [outputType, setOutputType] = React.useState<RoadWorkOutputType>("rti");
  const [language, setLanguage] = React.useState<RoadWorkLanguage>("English");
  const [originalRequests, setOriginalRequests] = React.useState("");
  const [replyText, setReplyText] = React.useState("");
  const [analysis, setAnalysis] = React.useState<RoadWorkReplyAnalysis | null>(null);
  const [raw, setRaw] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function analyze() {
    setBusy(true);
    setError(null);
    setAnalysis(null);
    setRaw(null);
    try {
      const r = await analyzeRoadWorkReply({ outputType, language, originalRequests, replyText });
      if (r.analysis) setAnalysis(r.analysis);
      if (r.raw && !r.analysis) setRaw(r.raw);
      if (!r.ok || r.error) setError(r.error ?? "Analysis failed.");
    } finally {
      setBusy(false);
    }
  }

  const gaps = React.useMemo(() => {
    if (!analysis) return "";
    const deficient = analysis.points.filter((p) => p.status !== "Answered");
    const lines = deficient.map((p) => `- [${p.section}] ${p.request} — ${p.appealGround || p.status}`);
    if (analysis.overall.missingSections?.length)
      lines.push(`Missing sections: ${analysis.overall.missingSections.join(", ")}`);
    return lines.join("\n");
  }, [analysis]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Type:</span>
          <div className="inline-flex rounded-md border bg-muted p-0.5 text-sm">
            {(["rti", "complaint"] as RoadWorkOutputType[]).map((t) => (
              <button key={t} type="button" onClick={() => setOutputType(t)}
                className={`rounded px-3 py-1 ${outputType === t ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}>
                {t === "rti" ? "RTI" : "Complaint"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Escalation language:</span>
          <div className="inline-flex rounded-md border bg-muted p-0.5 text-sm">
            {(["English", "Kannada"] as RoadWorkLanguage[]).map((l) => (
              <button key={l} type="button" onClick={() => setLanguage(l)}
                className={`rounded px-3 py-1 ${language === l ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}>
                {l === "Kannada" ? "ಕನ್ನಡ" : "English"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="orig" className="mb-1.5 block text-sm font-medium">What you originally asked for</Label>
          <Textarea id="orig" rows={8} value={originalRequests} onChange={(e) => setOriginalRequests(e.target.value)}
            placeholder="Paste the RTI/complaint letter or the list of points you requested." />
        </div>
        <div>
          <Label htmlFor="reply" className="mb-1.5 block text-sm font-medium">Reply received from BBMP</Label>
          <Textarea id="reply" rows={8} value={replyText} onChange={(e) => setReplyText(e.target.value)}
            placeholder="Paste the authority's reply text (or OCR of the reply letter)." />
        </div>
      </div>

      {aiConfigured ? (
        <Button onClick={analyze} disabled={busy || !replyText.trim() || !originalRequests.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
          Analyze reply
        </Button>
      ) : (
        <div className="rounded-md border border-amber/40 bg-amber/5 p-3 text-xs text-amber-dark">
          <AlertTriangle className="mb-1 h-4 w-4" /> <span className="font-semibold">AI not configured.</span> Set ANTHROPIC_API_KEY to enable reply analysis.
        </div>
      )}

      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</div>}
      {raw && !analysis && <pre className="overflow-auto rounded-md border bg-muted/40 p-3 text-xs">{raw}</pre>}

      {analysis && (
        <>
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Analysis</CardTitle>
              {analysis.overall.escalationRecommended ? (
                <Badge variant="destructive">Escalation recommended</Badge>
              ) : analysis.overall.complete ? (
                <Badge variant="success"><CheckCircle2 className="h-3 w-3" /> Reply complete</Badge>
              ) : (
                <Badge variant="warning">Incomplete</Badge>
              )}
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-muted-foreground">{analysis.overall.summary}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-1.5 pr-3">Point</th>
                      <th className="py-1.5 pr-3">Section</th>
                      <th className="py-1.5 pr-3">Status</th>
                      <th className="py-1.5">Suggested ground</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.points.map((p, i) => (
                      <tr key={i} className="border-b border-border/50 align-top">
                        <td className="py-2 pr-3">{p.request}</td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">{p.section}</td>
                        <td className="py-2 pr-3"><Badge variant={statusVariant(p.status)}>{p.status}</Badge></td>
                        <td className="py-2 text-xs text-foreground/70">{p.appealGround || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Draft the {outputType === "rti" ? "first appeal" : "escalation complaint"}</CardTitle></CardHeader>
            <CardContent>
              <AiDraftPanel
                aiConfigured={aiConfigured}
                kind={outputType === "rti" ? "road_work_first_appeal" : "road_work_escalation"}
                language={language}
                generate={() =>
                  generateRoadWorkEscalation({
                    outputType,
                    language,
                    originalRequests,
                    replyText,
                    gaps,
                  })
                }
                inputs={
                  <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                    <p className="font-semibold text-foreground">Auto-drafts from the gaps above</p>
                    <p className="mt-1">{analysis.points.filter((p) => p.status !== "Answered").length} deficient point(s) will be cited.</p>
                  </div>
                }
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
