"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, UploadCloud, FileText, Sparkles, CheckCircle2, AlertTriangle, Layers, Trash2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { analyzeComplaintIntakeAction, commitComplaintIntakeAction } from "@/lib/actions/complaint-intake";
import type { DetectedComplaint, CreatedComplaintSummary } from "@/lib/complaints/multi-intake";
import type { ComplaintIntakeExtraction } from "@/lib/ai/complaint-intake-analyzer";

const COMPLAINT_TYPES = [
  "Road", "Drain", "Garbage", "Streetlight", "Footpath", "Park", "Water Logging",
  "Encroachment", "Building Violation", "Public Works", "Bill Payment",
  "Tender Irregularity", "Contractor Issue", "Health Issue", "Revenue Issue",
  "Engineer Non Response", "Ward Office Issue", "Other",
];

type Phase = "idle" | "analyzing" | "review" | "committing" | "done";

export function ComplaintIntakeImport({
  presetFiles,
  onReset,
}: {
  presetFiles?: File[];
  onReset?: () => void;
} = {}) {
  const router = useRouter();
  const [files, setFiles] = React.useState<File[]>([]);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [storagePath, setStoragePath] = React.useState("");
  const [originalName, setOriginalName] = React.useState("");
  const [pageCount, setPageCount] = React.useState(0);
  const [complaints, setComplaints] = React.useState<DetectedComplaint[]>([]);
  const [created, setCreated] = React.useState<CreatedComplaintSummary[]>([]);

  const multi = complaints.length > 1;

  function setField<K extends keyof ComplaintIntakeExtraction>(idx: number, k: K, v: ComplaintIntakeExtraction[K]) {
    setComplaints((prev) => prev.map((c, i) => (i === idx ? { ...c, extraction: { ...c.extraction, [k]: v } } : c)));
  }
  function removeComplaint(idx: number) {
    setComplaints((prev) => prev.filter((_, i) => i !== idx));
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
      if (res.error || !res.success || !res.complaints?.length) {
        setError(res.error || "Could not analyse the file.");
        setPhase("idle");
        return;
      }
      setStoragePath(res.storagePath || "");
      setOriginalName(res.originalName || "");
      setPageCount(res.pageCount || 0);
      setComplaints(res.complaints);
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setPhase("idle");
    }
  }

  async function commit() {
    if (complaints.length === 0) return;
    setPhase("committing");
    setError(null);
    try {
      const res = await commitComplaintIntakeAction({
        storagePath,
        originalName,
        complaints: complaints.map((c) => ({ pageStart: c.pageStart, pageEnd: c.pageEnd, ocrText: c.ocrText, extraction: c.extraction })),
      });
      if (res.error || !res.success || !res.created?.length) {
        setError(res.error || "Could not create the complaint(s).");
        setPhase("review");
        return;
      }
      setCreated(res.created);
      // Single complaint → jump straight into it, as before.
      if (res.created.length === 1) {
        router.push(`/complaints/${res.created[0]!.complaintId}`);
        router.refresh();
        return;
      }
      setPhase("done");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Commit failed");
      setPhase("review");
    }
  }

  function reset() {
    setPhase("idle");
    setComplaints([]);
    setCreated([]);
    setFiles([]);
    setError(null);
    if (onReset) onReset();
  }

  if (phase === "analyzing" || phase === "committing") {
    return (
      <Card className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm rounded-xl">
        <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium animate-pulse">
            {phase === "analyzing"
              ? "Reading the document, detecting complaint letters, and extracting each one…"
              : `Creating ${complaints.length} complaint${complaints.length === 1 ? "" : "s"}…`}
          </p>
        </CardContent>
      </Card>
    );
  }

  // Completion summary (multi-complaint) — "Total Complaints Created: N".
  if (phase === "done") {
    return (
      <Card className="border border-emerald-200 bg-white dark:border-emerald-900/40 dark:bg-slate-900 shadow-sm rounded-xl">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-base font-bold">Upload complete</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Original PDF: <span className="font-medium text-slate-700 dark:text-slate-300">{originalName || "upload"}</span>
          </p>
          <div className="rounded-lg border border-slate-150 dark:border-slate-800">
            <div className="border-b border-slate-100 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800">
              Detected complaints
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {created.map((c) => (
                <li key={c.complaintId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  <Link href={`/complaints/${c.complaintId}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                    {c.subject || "Complaint"}
                  </Link>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{c.caseNumber}</span>
                  <span className="shrink-0 text-xs text-slate-400">pp. {c.pageStart}–{c.pageEnd}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800/85">
            <span className="text-sm font-bold">Total Complaints Created: {created.length}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={reset}>Upload another</Button>
              <Button size="sm" asChild><Link href="/complaints">Go to complaints <ArrowRight className="h-4 w-4 ml-1" /></Link></Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (phase === "review" && complaints.length > 0) {
    return (
      <div className="space-y-4">
        {error && <p className="rounded-lg border border-rose-200/30 bg-rose-50/10 p-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}

        {multi && (
          <div className="flex items-start gap-2.5 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3.5 dark:border-slate-800 dark:bg-slate-950/30">
            <Layers className="h-4.5 w-4.5 shrink-0 text-indigo-600 dark:text-indigo-400 mt-0.5" />
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Detected <strong>{complaints.length} complaint letters</strong> in <span className="font-medium">{originalName || "this PDF"}</span> ({pageCount} pages).
              Each becomes its own complaint with its own pages. Review below, remove any that aren&apos;t separate complaints, then create them all.
            </p>
          </div>
        )}

        {complaints.map((c, idx) => {
          const ex = c.extraction;
          return (
            <Card key={idx} className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm rounded-xl">
              <CardContent className="p-5 space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {multi && <span className="rounded-full bg-slate-800 px-2 py-0.5 font-bold text-white dark:bg-slate-200 dark:text-slate-900">Complaint {idx + 1}</span>}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">Pages {c.pageStart}–{c.pageEnd}</span>
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${ex.confidence === "High" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : ex.confidence === "Low" ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"}`}>
                    AI: {ex.confidence}
                  </span>
                  {ex.jobNumber && <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-mono text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">{ex.jobNumber}</span>}
                  {multi && (
                    <button type="button" onClick={() => removeComplaint(idx)} className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20" title="Not a separate complaint — remove">
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Subject</Label>
                    <Input value={ex.subject} onChange={(e) => setField(idx, "subject", e.target.value)} className="mt-1" placeholder="Complaint subject" />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Type</Label>
                    <select value={ex.complaintType} onChange={(e) => setField(idx, "complaintType", e.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                      {COMPLAINT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Department (recognised)</Label>
                    <Input value={ex.department} onChange={(e) => setField(idx, "department", e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Area / ward</Label>
                    <Input value={ex.areaOrWard} onChange={(e) => setField(idx, "areaOrWard", e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Reporter</Label>
                    <Input value={ex.reporterName} onChange={(e) => setField(idx, "reporterName", e.target.value)} className="mt-1" />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Requested action</Label>
                    <Input value={ex.requestedAction} onChange={(e) => setField(idx, "requestedAction", e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Job code (optional)</Label>
                    <Input value={ex.jobNumber} onChange={(e) => setField(idx, "jobNumber", e.target.value)} className="mt-1" placeholder="225-25-001234" pattern="\d{3}-\d{2}-\d{6}" />
                  </div>
                </div>

                {ex.summary && <p className="text-xs text-slate-500 dark:text-slate-400">{ex.summary}</p>}
              </CardContent>
            </Card>
          );
        })}

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800/85">
          <Button type="button" variant="outline" onClick={reset} className="h-10">Start over</Button>
          <Button type="button" onClick={commit} disabled={complaints.every((c) => !c.extraction.subject.trim())} className="h-10 font-bold">
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            {multi ? `Create ${complaints.length} complaints` : "Create complaint"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm rounded-xl">
      <CardContent className="p-6 space-y-5">
        {error && <p className="rounded-lg border border-rose-200/30 bg-rose-50/10 p-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-100 bg-amber-50/30 p-3.5 dark:border-slate-800 dark:bg-slate-950/30">
          <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Upload complaint letters (PDF or photos). AI reads the document, and if it contains <strong>several complaint letters</strong> it
            detects each one and creates a separate complaint per letter — otherwise it creates a single complaint, as before. Review before creating.
          </p>
        </div>
        <label htmlFor="intake-file" className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/40 px-4 py-10 text-center transition-colors hover:border-primary/50 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950/30 dark:hover:bg-slate-900/50">
          <UploadCloud className="h-8 w-8 text-slate-400" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Choose a letter or multi-complaint PDF</span>
          <span className="text-xs text-slate-400">PDF, JPEG, PNG or WebP</span>
          <input id="intake-file" type="file" accept="application/pdf,image/*" multiple className="hidden" onChange={onPick} />
        </label>
        {files.length > 0 && (
          <ul className="space-y-1.5">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="truncate">{f.name}</span>
                <span className="ml-auto shrink-0 text-slate-400">{(f.size / 1_048_576).toFixed(1)} MB</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end border-t border-slate-100 dark:border-slate-800/85 pt-4">
          <Button type="button" onClick={() => analyze()} disabled={files.length === 0} className="h-10 font-bold">
            <Sparkles className="h-4 w-4 mr-1.5" /> Analyze
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
