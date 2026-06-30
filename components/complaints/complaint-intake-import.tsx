"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, UploadCloud, FileText, Sparkles, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { analyzeComplaintIntakeAction, commitComplaintIntakeAction } from "@/lib/actions/complaint-intake";
import type { ComplaintIntakeExtraction } from "@/lib/ai/complaint-intake-analyzer";

const COMPLAINT_TYPES = [
  "Road", "Drain", "Garbage", "Streetlight", "Footpath", "Park", "Water Logging",
  "Encroachment", "Building Violation", "Public Works", "Bill Payment",
  "Tender Irregularity", "Contractor Issue", "Health Issue", "Revenue Issue",
  "Engineer Non Response", "Ward Office Issue", "Other",
];

type Phase = "idle" | "analyzing" | "review" | "committing";

export function ComplaintIntakeImport({ presetFiles }: { presetFiles?: File[] } = {}) {
  const router = useRouter();
  const [files, setFiles] = React.useState<File[]>([]);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [storagePath, setStoragePath] = React.useState("");
  const [ocrText, setOcrText] = React.useState("");
  const [ex, setEx] = React.useState<ComplaintIntakeExtraction | null>(null);

  function setField<K extends keyof ComplaintIntakeExtraction>(k: K, v: ComplaintIntakeExtraction[K]) {
    setEx((prev) => (prev ? { ...prev, [k]: v } : prev));
  }

  // Auto-started by the unified upload (SmartUpload already picked the letter/PDF).
  React.useEffect(() => {
    if (presetFiles && presetFiles.length) {
      setFiles(presetFiles);
      void analyze(presetFiles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(e.target.files ?? []));
    setError(null);
    e.target.value = "";
  }

  async function analyze(fs: File[] = files) {
    if (fs.length === 0) return;
    setPhase("analyzing");
    setError(null);
    try {
      const fd = new FormData();
      fs.forEach((f) => fd.append("files", f));
      const res = await analyzeComplaintIntakeAction(fd);
      if (res.error || !res.success || !res.extraction) {
        setError(res.error || "Could not analyse the file.");
        setPhase("idle");
        return;
      }
      setStoragePath(res.storagePath || "");
      setOcrText(res.ocrText || "");
      setEx(res.extraction);
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setPhase("idle");
    }
  }

  async function commit() {
    if (!ex) return;
    setPhase("committing");
    setError(null);
    try {
      const res = await commitComplaintIntakeAction({ storagePath, ocrText, extraction: ex });
      if (res.error || !res.success || !res.complaintId) {
        setError(res.error || "Could not create the complaint.");
        setPhase("review");
        return;
      }
      router.push(`/complaints/${res.complaintId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Commit failed");
      setPhase("review");
    }
  }

  if (phase === "analyzing" || phase === "committing") {
    return (
      <Card className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm rounded-xl">
        <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium animate-pulse">
            {phase === "analyzing" ? "Reading the letter and recognising the department & subject…" : "Creating the complaint…"}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (phase === "review" && ex) {
    return (
      <Card className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm rounded-xl">
        <CardContent className="p-6 space-y-4">
          {error && <p className="rounded-lg border border-rose-250/30 bg-rose-50/10 p-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 font-semibold ${ex.confidence === "High" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : ex.confidence === "Low" ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"}`}>
              AI confidence: {ex.confidence}
            </span>
            {ex.needsManualReview && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">verify before saving</span>}
            {ex.jobNumber && <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-mono text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">{ex.jobNumber}</span>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Subject</Label>
              <Input value={ex.subject} onChange={(e) => setField("subject", e.target.value)} className="mt-1" placeholder="Complaint subject" />
            </div>
            <div>
              <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Type</Label>
              <select value={ex.complaintType} onChange={(e) => setField("complaintType", e.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                {COMPLAINT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Department (recognised)</Label>
              <Input value={ex.department} onChange={(e) => setField("department", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Area / ward</Label>
              <Input value={ex.areaOrWard} onChange={(e) => setField("areaOrWard", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Reporter</Label>
              <Input value={ex.reporterName} onChange={(e) => setField("reporterName", e.target.value)} className="mt-1" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Requested action</Label>
              <Input value={ex.requestedAction} onChange={(e) => setField("requestedAction", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Job code (optional)</Label>
              <Input value={ex.jobNumber} onChange={(e) => setField("jobNumber", e.target.value)} className="mt-1" placeholder="225-25-001234" pattern="\d{3}-\d{2}-\d{6}" />
            </div>
          </div>

          {ex.summary && <p className="text-xs text-slate-500 dark:text-slate-400">{ex.summary}</p>}

          {ex.suggestedNextActions.length > 0 && (
            <div className="rounded-lg border border-blue-100 bg-blue-50/30 p-3 dark:border-slate-800 dark:bg-slate-950/30">
              <p className="mb-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">Suggested next actions</p>
              <ul className="list-disc pl-4 text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                {ex.suggestedNextActions.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
              {ex.recommendedEscalation && <p className="mt-1 text-[11px] text-slate-500">If unresolved: {ex.recommendedEscalation}</p>}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-150 dark:border-slate-800/85 pt-4">
            <Button type="button" variant="outline" onClick={() => { setPhase("idle"); setEx(null); setFiles([]); }} className="h-10">Start over</Button>
            <Button type="button" onClick={commit} disabled={!ex.subject.trim()} className="h-10 font-bold">
              <CheckCircle2 className="h-4 w-4 mr-1.5" /> Create complaint
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm rounded-xl">
      <CardContent className="p-6 space-y-5">
        {error && <p className="rounded-lg border border-rose-250/30 bg-rose-50/10 p-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-100 bg-amber-50/30 p-3.5 dark:border-slate-800 dark:bg-slate-950/30">
          <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Upload a complaint letter or acknowledgement (PDF or photos). AI reads it, recognises the department, subject
            and type, and suggests next actions — review, then create the complaint and track it stage by stage.
          </p>
        </div>
        <label htmlFor="intake-file" className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-250 bg-slate-50/40 px-4 py-10 text-center transition-colors hover:border-primary/50 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950/30 dark:hover:bg-slate-900/50">
          <UploadCloud className="h-8 w-8 text-slate-400" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Choose a letter (PDF or images)</span>
          <span className="text-xs text-slate-400">PDF, JPEG, PNG or WebP</span>
          <input id="intake-file" type="file" accept="application/pdf,image/*" multiple className="hidden" onChange={onPick} />
        </label>
        {files.length > 0 && (
          <ul className="space-y-1.5">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg border border-slate-150 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="truncate">{f.name}</span>
                <span className="ml-auto shrink-0 text-slate-400">{(f.size / 1_048_576).toFixed(1)} MB</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end border-t border-slate-150 dark:border-slate-800/85 pt-4">
          <Button type="button" onClick={() => analyze()} disabled={files.length === 0} className="h-10 font-bold">
            <Sparkles className="h-4 w-4 mr-1.5" /> Analyze letter
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
