"use client";

import * as React from "react";
import { Sparkles, Loader2, Copy, Printer, Save, Check, AlertTriangle, Download, Pencil, Eye, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { LetterPreview } from "@/components/complaints/letter-preview";
import { printLetter } from "@/lib/print-letter";
import { COMPLAINT_DRAFT_KINDS, LEGAL_TONES, DRAFT_LANGUAGES, type ComplaintDraftKind, type LegalTone, type DraftLanguage } from "@/lib/constants";
import { saveComplaintAiDraft } from "@/lib/actions/complaints";
import { startAiDraftJob, getJobAction } from "@/lib/actions/jobs";
import type { AiDraft } from "@/lib/types";
import { formatDateTime } from "@/lib/format";

const selectCls = "h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ComplaintAiDrafts({
  complaintId,
  aiConfigured,
  saved,
}: {
  complaintId: string;
  aiConfigured: boolean;
  saved: AiDraft[];
}) {
  const [kind, setKind] = React.useState<ComplaintDraftKind>("followup_letter");
  const [tone, setTone] = React.useState<LegalTone>("Formal");
  const [language, setLanguage] = React.useState<DraftLanguage>("English");
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedMsg, setSavedMsg] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [view, setView] = React.useState<"preview" | "edit">("preview");
  // Live status while a generation job is running — see the "Live" block below.
  const [liveText, setLiveText] = React.useState("");
  const [stageLabel, setStageLabel] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [elapsed, setElapsed] = React.useState(0);
  const startedAtRef = React.useRef(0);
  const activeRef = React.useRef(true);
  React.useEffect(() => () => { activeRef.current = false; }, []);
  React.useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [busy]);

  // Generation runs as a BACKGROUND job: it keeps running (and saves + alerts on
  // finish) even if you navigate away. We poll here for the in-place result; if
  // this panel unmounts, the job still completes and shows in Saved drafts + the
  // notifications bell. While it runs, the job row also carries a live status
  // (current pipeline stage + streamed partial text) that we poll quickly to
  // show real-time progress — see onDraftProgress in lib/actions/jobs.ts.
  async function generate() {
    setBusy(true); setError(null); setSavedMsg(false); setLiveText("");
    setStageLabel("Connecting to Claude…"); setProgress(5);
    startedAtRef.current = Date.now();
    const start = await startAiDraftJob({ complaintId, kind, tone, language });
    if (!start.ok || !start.jobId) {
      setError(start.error ?? "Could not start generation."); setBusy(false); setStageLabel(null); setProgress(null);
      return;
    }
    const jid = start.jobId;
    const poll = async () => {
      if (!activeRef.current) return;
      const r = await getJobAction(jid);
      const job = r.job;
      if (!job) { setError(r.error ?? "Job not found."); setBusy(false); setStageLabel(null); setProgress(null); return; }
      const result = job.result as { text?: string; partial?: boolean; stageLabel?: string; lintWarning?: string } | null;
      if (job.status === "done") {
        if (result?.text) { setDraft(result.text); setView("preview"); }
        setBusy(false); setStageLabel(null); setProgress(null); setLiveText("");
        return;
      }
      if (job.status === "failed") { setError(job.error ?? "Generation failed."); setBusy(false); setStageLabel(null); setProgress(null); return; }
      if (result?.partial) {
        if (typeof result.text === "string") setLiveText(result.text);
        if (result.stageLabel) setStageLabel(result.stageLabel);
      }
      if (typeof job.progress === "number") setProgress(job.progress);
      setTimeout(poll, 800);
    };
    setTimeout(poll, 500);
  }
  async function save() {
    if (!draft.trim()) return;
    const r = await saveComplaintAiDraft({ complaintId, kind, title: COMPLAINT_DRAFT_KINDS[kind], content: draft, language });
    if (r.ok) { setSavedMsg(true); setTimeout(() => setSavedMsg(false), 2500); }
    else setError(r.error ?? "Could not save.");
  }
  async function copy() {
    try { await navigator.clipboard.writeText(draft); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ }
  }
  function download() {
    if (!draft.trim()) return;
    const blob = new Blob([draft], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${COMPLAINT_DRAFT_KINDS[kind].replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
  /** Reopen a previously saved draft in the editor for further editing. */
  function loadDraft(d: AiDraft) {
    if (d.kind && d.kind in COMPLAINT_DRAFT_KINDS) setKind(d.kind as ComplaintDraftKind);
    setDraft(d.content ?? "");
    setError(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Draft</Label>
          <select className={selectCls} value={kind} onChange={(e) => setKind(e.target.value as ComplaintDraftKind)}>
            {Object.entries(COMPLAINT_DRAFT_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tone</Label>
          <select className={selectCls} value={tone} onChange={(e) => setTone(e.target.value as LegalTone)}>
            {LEGAL_TONES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Language</Label>
          <select className={selectCls} value={language} onChange={(e) => setLanguage(e.target.value as DraftLanguage)}>
            {DRAFT_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        {aiConfigured ? (
          <Button onClick={generate} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {draft ? "Regenerate" : "Generate"}
          </Button>
        ) : (
          <span className="text-xs text-amber-dark"><AlertTriangle className="mr-1 inline h-3 w-3" />AI not configured — use templates / write manually below.</span>
        )}
      </div>

      <div className="rounded-md border border-amber/50 bg-amber/5 px-3 py-1.5 text-xs font-medium text-amber-dark">
        ⚠ Review before sending — drafts are editable and are never sent automatically.
      </div>
      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</div>}

      {busy && (
        <div className="space-y-2.5 rounded-md border border-primary/30 bg-primary/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              LIVE
              <Activity className="h-3.5 w-3.5" />
              <span className="font-normal text-primary/90">{stageLabel ?? "Working…"}</span>
            </div>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {liveText ? `${liveText.length.toLocaleString()} chars · ` : ""}{elapsed}s
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/10">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${Math.max(6, progress ?? 8)}%` }}
            />
          </div>
          {liveText && (
            <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded border bg-background/70 p-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {liveText}
              <span className="ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 animate-pulse bg-primary/70 align-middle" />
            </div>
          )}
        </div>
      )}

      {!busy && draft && (
        <div className="no-print flex items-center gap-1 rounded-md border bg-muted/40 p-0.5 text-xs w-fit">
          <button type="button" onClick={() => setView("preview")} className={`flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors ${view === "preview" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
            <Eye className="h-3.5 w-3.5" /> Preview
          </button>
          <button type="button" onClick={() => setView("edit")} className={`flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors ${view === "edit" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        </div>
      )}

      {!busy && (
        draft && view === "preview" ? (
          <LetterPreview markdown={draft} />
        ) : (
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={16} placeholder="Generated draft appears here and is fully editable…" className="font-mono text-sm" />
        )
      )}

      <div className="no-print flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={copy} disabled={!draft}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}</Button>
        <Button variant="outline" size="sm" onClick={() => { setView("preview"); setTimeout(printLetter, 60); }} disabled={!draft}><Printer className="h-4 w-4" /> Print / PDF</Button>
        <Button variant="outline" size="sm" onClick={download} disabled={!draft}><Download className="h-4 w-4" /> Download .txt</Button>
        <Button variant="outline" size="sm" onClick={save} disabled={!draft}>{savedMsg ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />} {savedMsg ? "Saved" : "Save draft"}</Button>
      </div>

      {saved.length > 0 && (
        <div className="pt-2">
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Saved drafts</p>
          <ul className="space-y-2 text-sm">
            {saved.map((d) => (
              <li key={d.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium capitalize">{d.kind.replace(/_/g, " ")}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-muted-foreground">{formatDateTime(d.created_at)}</span>
                    <Button variant="outline" size="sm" onClick={() => loadDraft(d)}><Pencil className="h-3.5 w-3.5" /> Load</Button>
                  </div>
                </div>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{d.content}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
