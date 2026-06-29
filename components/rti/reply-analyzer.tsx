"use client";

import * as React from "react";
import Link from "next/link";
import {
  Loader2,
  Sparkles,
  AlertTriangle,
  Scale,
  CheckCircle2,
  Calendar,
  Clock,
  FileText,
  Eye,
  ArrowRight,
  Download,
  Info,
  ShieldCheck,
  AlertOctagon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { analyzeRtiReplyFromDocuments, type ReplyAnalysisResult } from "@/lib/actions/ai";

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  Answered: "success",
  "Partially answered": "warning",
  "Not answered": "destructive",
  Denied: "destructive",
  Irrelevant: "secondary",
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
    recommendText: "First Appeal Recommended",
    next: null,
  },
  "FAA Order": {
    panelLabel: "FAA order — first-appeal decision",
    responseLabel: "First Appellate Authority (FAA) order",
    escalationLabel: "second appeal",
    recommendText: "Second Appeal Recommended",
    next: null,
  },
  "Second Appeal Order": {
    panelLabel: "Information Commission order",
    responseLabel: "Information Commission order (second appeal)",
    escalationLabel: "higher appeal / writ petition",
    recommendText: "Writ Petition Recommended",
    next: null,
  },
  "Higher Appeal Order": {
    panelLabel: "Higher appeal order — writ petition / HC decision",
    responseLabel: "higher appeal order",
    escalationLabel: "",
    recommendText: "Supreme Court SLP Recommended",
    next: null,
  },
  Other: OTHER_STAGE,
};

const RESPONSE_TYPES = ["Reply", "FAA Order", "Second Appeal Order", "Higher Appeal Order", "Other"];

function fmtDate(d: string | null | Date): string {
  if (!d) return "—";
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return String(d);
  return parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function ReplyAnalyzer({
  rtiId,
  rti,
  aiConfigured,
  applicationText,
  applicationSource,
  responseTextByType,
  responseCounts,
  defaultType,
}: {
  rtiId: string;
  rti: any;
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

  // Active dialog state for "Read More" and "Eye" details
  const [activeDialog, setActiveDialog] = React.useState<{
    type: "ground" | "notes" | "detail";
    title: string;
    content: string;
    item?: any;
  } | null>(null);

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
  
  // Stats
  const answered = items.filter((it) => it.status === "Answered").length;
  const partially = items.filter((it) => it.status === "Partially answered" || it.status === "Needs clarification").length;
  const notAnswered = items.filter((it) => it.status === "Not answered" || it.status === "Denied").length;
  
  const overall = result?.analysis?.overall;
  const deficient = !!overall?.firstAppealRecommended;

  // Calculate Days Remaining
  const getDaysRemaining = (dueDateStr: string | null) => {
    if (!dueDateStr) return null;
    const due = new Date(dueDateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = due.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const daysLeft = getDaysRemaining(rti.normal_due);

  const renderDaysBadge = () => {
    if (daysLeft === null) return <Badge variant="secondary">—</Badge>;
    if (daysLeft < 0) {
      return (
        <Badge variant="destructive" className="animate-indicator-blink">
          {Math.abs(daysLeft)} Days Overdue
        </Badge>
      );
    }
    if (daysLeft <= 7) {
      return (
        <Badge variant="warning" className="animate-indicator-blink">
          {daysLeft} Days Left
        </Badge>
      );
    }
    return <Badge variant="info">{daysLeft} Days Left</Badge>;
  };

  // Build Executive Summary Paragraph
  const getExecutiveSummary = () => {
    if (!result) {
      return "Compare the RTI application and the response document to generate an AI-powered executive summary and recommendation.";
    }
    if (overall?.summary) {
      return overall.summary;
    }
    if (deficient) {
      return `The uploaded PIO reply answered only ${answered} of the ${items.length} requested questions. Several critical records remain unanswered or denied. Since no valid exemption has been cited under the RTI Act, filing a First Appeal is recommended.`;
    }
    return `The PIO reply has been successfully analyzed and appears to answer the requested points. Out of ${items.length} points, ${answered} were fully answered. No further escalation is required at this stage.`;
  };

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">RTI Reply Analysis</h1>
          <p className="text-sm text-slate-500 mt-1">
            AI comparison between the RTI application and the uploaded PIO reply.
          </p>
        </div>
        <div className="flex items-center gap-2.5 no-print">
          <Button onClick={() => window.print()} variant="outline" className="h-9 gap-1.5 text-xs font-medium">
            <Download className="h-4 w-4" /> Download Report
          </Button>
          <Button
            onClick={() => runAnalyze(questions, responseText, selectedType)}
            disabled={busy || !responseText.trim()}
            className="h-9 gap-1.5 text-xs font-medium"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Compare &amp; Analyze
          </Button>
        </div>
      </div>

      {/* SECTION 1: RECOMMENDATION SUMMARY CARD */}
      <Card className="overflow-hidden border border-slate-200 bg-slate-50/50 dark:bg-slate-900/10 rounded-2xl shadow-xs">
        <CardContent className="p-6">
          <div className="flex flex-col gap-6 lg:flex-row">
            {/* LEFT (70%) */}
            <div className="flex-1 space-y-4 lg:border-r lg:pr-6 border-slate-200">
              <div className="flex items-start gap-3">
                {deficient ? (
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 border border-rose-200 text-rose-600 shrink-0">
                    <Scale className="h-5 w-5" />
                  </div>
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 shrink-0">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    {deficient ? stage.recommendText : "Response Appears Complete"}
                  </h2>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
                    {getExecutiveSummary()}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="font-medium">Confidence:</span>
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold dark:bg-emerald-950/20 dark:border-emerald-900">
                    High
                  </Badge>
                </div>
                <div className="h-3.5 w-px bg-slate-250" />
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="font-medium">Type:</span>
                  <Badge variant="secondary" className="font-semibold">
                    {deficient ? "First Appeal" : "None"}
                  </Badge>
                </div>
                <div className="h-3.5 w-px bg-slate-250" />
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="font-medium">Severity:</span>
                  <Badge variant={deficient ? "destructive" : "secondary"} className="font-semibold">
                    {deficient ? "Medium / High" : "None"}
                  </Badge>
                </div>
              </div>
            </div>

            {/* RIGHT (30%) */}
            <div className="w-full lg:w-72 shrink-0 flex flex-col justify-center gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4.5 w-4.5 text-blue-500 shrink-0" />
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Application Date</p>
                    <p className="text-xs font-bold text-foreground">{fmtDate(rti.date_filed)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="h-4.5 w-4.5 text-purple-500 shrink-0" />
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Reply Date</p>
                    <p className="text-xs font-bold text-foreground">{fmtDate(rti.date_received)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Statutory Deadline</p>
                    <p className="text-xs font-bold text-foreground">{fmtDate(rti.normal_due)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <AlertOctagon className="h-4.5 w-4.5 text-amber-500 shrink-0" />
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Days Remaining</p>
                    <div className="mt-0.5">{renderDaysBadge()}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* INPUT DETAILS ACCORDION */}
      <div className="grid gap-4 lg:grid-cols-2 no-print">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">RTI application — questions asked</Label>
          <Textarea value={questions} onChange={(e) => setQuestions(e.target.value)} rows={7} className="text-sm resize-none" />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Response to analyze</Label>
            <select
              className={`${selectCls} max-w-[12rem] h-8 text-xs`}
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
            rows={7}
            className="text-sm resize-none"
            placeholder={`${stage.panelLabel} — text appears here, or paste it.`}
          />
        </div>
      </div>

      {result?.error && !result.analysis && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {result.error}
        </div>
      )}

      {/* SECTION 2: ANALYSIS TABLE */}
      {result?.analysis && (
        <div className="space-y-6">
          <Card className="overflow-hidden border border-slate-200 bg-white shadow-xs rounded-xl">
            <div className="overflow-x-auto">
              <Table className="w-full text-left border-collapse">
                <TableHeader className="sticky top-0 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 z-10">
                  <TableRow>
                    <TableHead className="w-12 text-center text-xs font-semibold uppercase tracking-wider text-slate-500 py-3.5">#</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 py-3.5">Question</TableHead>
                    <TableHead className="w-40 text-xs font-semibold uppercase tracking-wider text-slate-500 py-3.5">Status</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 py-3.5">Suggested Ground</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 py-3.5">Notes</TableHead>
                    <TableHead className="w-24 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 py-3.5 pr-6">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it, i) => (
                    <TableRow
                      key={i}
                      className="h-[76px] odd:bg-white even:bg-slate-50/20 hover:bg-blue-50/30 dark:hover:bg-blue-950/10 transition-all duration-150 border-b border-slate-200/60"
                    >
                      <TableCell className="text-center font-mono text-xs text-slate-400 align-top py-4">{i + 1}</TableCell>
                      <TableCell className="align-top py-4">
                        <p className="font-semibold text-sm text-foreground">{it.question}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Item #{i + 1}</p>
                      </TableCell>
                      <TableCell className="align-top py-4">
                        <Badge variant={STATUS_VARIANT[it.status] ?? "secondary"} className="text-[11px] font-semibold px-2.5 py-0.5 shadow-xs">
                          {it.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top py-4 text-sm text-slate-655 dark:text-slate-400 max-w-xs">
                        <div className="line-clamp-2">{it.appealGround || "—"}</div>
                        {it.appealGround && it.appealGround.length > 50 && (
                          <button
                            onClick={() => setActiveDialog({ type: "ground", title: `Suggested Ground (Item #${i + 1})`, content: it.appealGround || "" })}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline mt-1 focus:outline-none"
                          >
                            Read More
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="align-top py-4 text-sm text-slate-655 dark:text-slate-400 max-w-xs">
                        <div className="line-clamp-2">{it.notes || "—"}</div>
                        {it.notes && it.notes.length > 50 && (
                          <button
                            onClick={() => setActiveDialog({ type: "notes", title: `Analysis Notes (Item #${i + 1})`, content: it.notes || "" })}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline mt-1 focus:outline-none"
                          >
                            Read More
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="align-top py-4 text-right pr-6">
                        <div className="flex items-center justify-end gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-slate-400 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800"
                                  onClick={() => setActiveDialog({ type: "detail", title: `Point-by-Point Analysis (Item #${i + 1})`, content: "", item: it })}
                                  aria-label="View Complete Analysis"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>View Complete Analysis</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* BOTTOM SUMMARY STATS */}
          <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
            <Card className="bg-white border border-slate-200 shadow-xs">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Answered</span>
                <span className="text-2xl font-bold text-emerald-600 mt-1">{answered}</span>
              </CardContent>
            </Card>
            <Card className="bg-white border border-slate-200 shadow-xs">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Partially</span>
                <span className="text-2xl font-bold text-amber-500 mt-1">{partially}</span>
              </CardContent>
            </Card>
            <Card className="bg-white border border-slate-200 shadow-xs">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Not Answered</span>
                <span className="text-2xl font-bold text-rose-500 mt-1">{notAnswered}</span>
              </CardContent>
            </Card>
            <Card className="bg-white border border-slate-200 shadow-xs">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Completion</span>
                <span className="text-2xl font-bold text-blue-600 mt-1">{Math.round((answered / (items.length || 1)) * 100)}%</span>
              </CardContent>
            </Card>
            <Card className="bg-white border border-slate-200 shadow-xs col-span-2 md:col-span-1">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Recommendation</span>
                <span className={cn("text-xs font-bold mt-2 px-2.5 py-0.5 rounded-full border", 
                  deficient 
                    ? "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/20 dark:border-rose-900 dark:text-rose-450" 
                    : "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900 dark:text-emerald-450"
                )}>
                  {deficient ? "Appeal Recommended" : "Complete"}
                </span>
              </CardContent>
            </Card>
          </div>

          <div className="rounded-md border border-amber/50 bg-amber/5 px-3 py-1.5 text-xs font-medium text-amber-dark flex items-center gap-2">
            <Info className="h-4 w-4 text-amber-550 shrink-0" />
            <span>AI assessment — review against the actual document before filing an appeal.</span>
          </div>
        </div>
      )}

      {/* SINGLE DIALOG FOR READ MORE / EYE VIEW DETAILS */}
      <Dialog open={activeDialog !== null} onOpenChange={(open) => { if (!open) setActiveDialog(null); }}>
        <DialogContent className="max-w-md sm:max-w-lg rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <Info className="h-5 w-5 text-primary" />
              {activeDialog?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            {activeDialog?.type === "detail" && activeDialog.item ? (
              <div className="space-y-3">
                <div className="border-b pb-2">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Question</h4>
                  <p className="mt-1 text-sm font-semibold text-foreground">{activeDialog.item.question}</p>
                </div>
                <div className="border-b pb-2">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Status</h4>
                  <div className="mt-1">
                    <Badge variant={STATUS_VARIANT[activeDialog.item.status] ?? "secondary"} className="font-semibold">
                      {activeDialog.item.status}
                    </Badge>
                  </div>
                </div>
                <div className="border-b pb-2">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Suggested Ground</h4>
                  <p className="mt-1 text-sm text-slate-650 dark:text-slate-350">{activeDialog.item.appealGround || "—"}</p>
                </div>
                <div>
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Notes</h4>
                  <p className="mt-1 text-sm text-slate-650 dark:text-slate-350">{activeDialog.item.notes || "—"}</p>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-slate-600 dark:text-slate-300">{activeDialog?.content || "—"}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
