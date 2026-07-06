"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, UploadCloud, FileText, Sparkles, AlertTriangle,
  CheckCircle2, Clock3, Eye, Link, Trash2, ArrowRight, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AckBatchProgress } from "@/lib/complaints/ack-reconcile";

type Phase = "idle" | "uploading" | "processing" | "error";

export function AckWorkflowStepper({ currentStep }: { currentStep: number }) {
  const steps = [
    { label: "Upload", desc: "Choose PDF scan", icon: UploadCloud },
    { label: "AI Detection", desc: "OCR & OCR split", icon: Sparkles },
    { label: "Review & Match", desc: "Verify matches", icon: Eye },
    { label: "Confirm", desc: "Attach to cases", icon: Link },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 select-none mb-6">
      {steps.map((step, idx) => {
        const Icon = step.icon;
        const isCompleted = idx < currentStep;
        const isActive = idx === currentStep;
        return (
          <div
            key={idx}
            className={cn(
              "relative flex items-center gap-3 rounded-2xl border p-3 transition-all duration-200",
              isCompleted
                ? "border-emerald-200 bg-emerald-50/10 text-emerald-800 dark:border-emerald-950/40 dark:bg-emerald-950/5 dark:text-emerald-350"
                : isActive
                ? "border-primary bg-primary/5 text-primary shadow-sm font-semibold ring-1 ring-primary/10"
                : "border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-900"
            )}
          >
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-sm transition-all duration-200",
                isCompleted
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : isActive
                  ? "border-primary bg-primary text-white"
                  : "border-slate-200 bg-slate-50 dark:border-slate-850 dark:bg-slate-950 text-slate-400"
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold leading-none tracking-tight">{step.label}</div>
              <div className="text-[10px] text-slate-450 dark:text-slate-500 leading-tight mt-1">{step.desc}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AckReconcileUpload() {
  const router = useRouter();
  const [files, setFiles] = React.useState<File[]>([]);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<AckBatchProgress | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(e.target.files ?? []));
    setError(null);
    e.target.value = "";
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function poll(batchId: string) {
    for (;;) {
      await new Promise((r) => setTimeout(r, 2500));
      let res: Response;
      try {
        res = await fetch(`/api/ack-import/${batchId}`, { cache: "no-store" });
      } catch {
        continue;
      }
      if (!res.ok) continue;
      const p = (await res.json()) as AckBatchProgress;
      setProgress(p);
      if (p.status === "failed") {
        setError(p.error || "Processing failed.");
        setPhase("error");
        return;
      }
      if (p.status !== "processing") {
        router.push(`/complaints/acknowledgments/${batchId}`);
        return;
      }
    }
  }

  async function start() {
    if (files.length === 0) return;
    setPhase("uploading");
    setError(null);
    setProgress(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/ack-import", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { batchId?: string; error?: string };
      if (!res.ok || !data.batchId) {
        setError(data.error || `Upload failed (HTTP ${res.status}).`);
        setPhase("error");
        return;
      }
      setPhase("processing");
      void poll(data.batchId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setPhase("error");
    }
  }

  const isUploading = phase === "uploading";
  const isProcessing = phase === "processing";

  if (isUploading || isProcessing) {
    const pct =
      progress && progress.pageCount > 0
        ? Math.min(100, Math.round((progress.processedPages / progress.pageCount) * 100))
        : isUploading ? 35 : 0;

    // Timeline steps for AI workflow
    const timelineSteps = [
      { id: "upload", label: "PDF Uploaded", status: isProcessing ? "complete" : "active" },
      { id: "ocr", label: "OCR Split", status: isProcessing ? (pct > 50 ? "complete" : "active") : "pending" },
      { id: "extract", label: "Extract Data", status: isProcessing ? (pct > 75 ? "complete" : pct > 50 ? "active" : "pending") : "pending" },
      { id: "match", label: "Find Matches", status: isProcessing ? (pct === 100 ? "complete" : pct > 75 ? "active" : "pending") : "pending" },
    ];

    return (
      <div className="space-y-6">
        <AckWorkflowStepper currentStep={isProcessing ? 1 : 0} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-3xs rounded-2xl overflow-hidden">
            <CardContent className="flex flex-col items-center justify-center p-8 text-center min-h-[320px]">
              <div className="relative mb-4">
                <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl animate-pulse" />
                <Loader2 className="h-10 w-10 animate-spin text-primary relative" />
              </div>
              
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                {isUploading ? "Uploading Batch PDF..." : progress?.stage || "Analyzing Documents..."}
              </h3>
              
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-sm">
                {isUploading
                  ? "Transferring your scanned files. Large documents can take a moment."
                  : progress?.message || "Splitting pages and extracting metadata using AI..."}
              </p>

              <div className="w-full max-w-sm mt-6 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-350">
                  <span>Progress</span>
                  <span>{pct}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-500 ease-out"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {progress && (
                  <div className="flex justify-between text-[10px] text-slate-450 dark:text-slate-500">
                    <span>{progress.processedPages}/{progress.pageCount} pages parsed</span>
                    <span>{progress.itemCount} matches found</span>
                  </div>
                )}
              </div>

              <div className="mt-6 flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-950 px-4 py-2 border border-slate-100 dark:border-slate-800/80">
                <Clock3 className="h-4.5 w-4.5 text-slate-450 animate-pulse" />
                <span className="text-[11px] text-slate-500 font-semibold">
                  Estimated Time: {isUploading ? "Calculating..." : `${Math.max(5, Math.ceil((progress?.pageCount || 10) - (progress?.processedPages || 0)) * 1.5)} seconds remaining`}
                </span>
              </div>

              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-4">
                You can safely close this browser tab — ingestion will continue in the background.
              </p>
            </CardContent>
          </Card>

          {/* AI Workflow Processing Timeline */}
          <Card className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-3xs rounded-2xl p-5">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              AI Pipeline Progress
            </h4>
            <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100 dark:before:bg-slate-800">
              {timelineSteps.map((s, idx) => {
                const isDone = s.status === "complete";
                const isActive = s.status === "active";
                return (
                  <div key={s.id} className="relative flex items-start gap-3">
                    <div
                      className={cn(
                        "absolute -left-6 flex h-4.5 w-4.5 items-center justify-center rounded-full border text-[9px] font-bold transition-all duration-300",
                        isDone
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : isActive
                          ? "border-primary bg-primary/20 text-primary scale-110"
                          : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 text-slate-400"
                      )}
                    >
                      {isDone ? <Check className="h-2.5 w-2.5 stroke-[3.5]" /> : idx + 1}
                    </div>
                    <div>
                      <p className={cn("text-xs font-bold", isDone ? "text-slate-700 dark:text-slate-300" : isActive ? "text-primary" : "text-slate-450 dark:text-slate-500")}>
                        {s.label}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-normal">
                        {isDone ? "Step completed successfully" : isActive ? "Working on this now..." : "Waiting to start"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AckWorkflowStepper currentStep={0} />

      <Card className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-3xs rounded-2xl overflow-hidden">
        <CardContent className="p-6 space-y-6">
          {error && (
            <div className="flex gap-2.5 rounded-xl border border-rose-200 bg-rose-50/20 p-3.5 text-xs text-rose-600 dark:border-rose-950/40 dark:bg-rose-950/10 dark:text-rose-450">
              <AlertTriangle className="h-4.5 w-4.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/10 p-4 dark:border-slate-800 dark:bg-slate-950/30">
            <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-blue-600 dark:text-blue-500 mt-0.5 animate-pulse" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Scanned PDF Batch Upload Instructions</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Upload a scanned PDF containing one or multiple BBMP acknowledgment sheets (receipt tokens). The AI pipeline split OCR system processes the documents page-by-page, decodes QR barcodes, extracts reference information, and proposes existing cases. You can verify and adjust boundaries page-by-page before attaching documents to database targets.
              </p>
            </div>
          </div>

          <label
            htmlFor="ack-file"
            className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/30 px-4 py-12 text-center transition-all hover:border-primary/50 hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950/20 dark:hover:bg-slate-900/40 group relative"
          >
            <div className="absolute inset-0 rounded-2xl bg-primary/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-150/80 dark:border-slate-850 shadow-3xs group-hover:scale-105 transition-transform duration-200">
              <UploadCloud className="h-5 w-5 text-slate-450 group-hover:text-primary transition-colors" />
            </div>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Drag &amp; Drop Acknowledgements Scan</span>
            <span className="text-[10px] text-slate-400">PDF, JPG, PNG formats supported. One file containing up to 100 pages.</span>
            <input id="ack-file" type="file" accept="application/pdf,image/*" multiple className="hidden" onChange={onPick} />
          </label>

          {files.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Selected Files</div>
              <ul className="space-y-2">
                {files.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 rounded-xl border border-slate-150 bg-white px-3 py-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 shadow-3xs hover:border-slate-350 transition-colors"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-50 dark:bg-slate-950 border text-slate-400">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-750 dark:text-slate-300 truncate">{f.name}</div>
                      <div className="text-[10px] text-slate-400 font-bold mt-0.5">{(f.size / 1_048_576).toFixed(2)} MB</div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-400 hover:text-rose-500 rounded-lg"
                      onClick={() => removeFile(i)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end border-t border-slate-100 dark:border-slate-850 pt-4">
            <Button
              type="button"
              onClick={start}
              disabled={files.length === 0}
              className="h-10 font-extrabold px-5 gap-2 rounded-xl"
            >
              <Sparkles className="h-4 w-4" />
              Upload &amp; Detect
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
