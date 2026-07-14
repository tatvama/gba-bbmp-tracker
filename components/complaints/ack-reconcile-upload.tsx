"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, UploadCloud, FileText, Sparkles, AlertTriangle,
  Clock3, Eye, Link, Trash2, ArrowRight, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AckBatchProgress } from "@/lib/complaints/ack-reconcile";
import { useTranslation } from "@/lib/i18n/client";

type Phase = "idle" | "uploading" | "processing" | "error";

export function AckWorkflowStepper({ currentStep }: { currentStep: number }) {
  const { t } = useTranslation("complaints");
  
  const steps = [
    { label: t("advanced.ack.stepUploadLabel"), desc: t("advanced.ack.stepUploadDesc"), icon: UploadCloud },
    { label: t("advanced.ack.stepAiDetectionLabel"), desc: t("advanced.ack.stepAiDetectionDesc"), icon: Sparkles },
    { label: t("advanced.ack.stepReviewMatchLabel"), desc: t("advanced.ack.stepReviewMatchDesc"), icon: Eye },
    { label: t("advanced.ack.stepConfirmLabel"), desc: t("advanced.ack.stepConfirmDesc"), icon: Link },
  ];

  return (
    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4 select-none mb-8">
      {steps.map((step, idx) => {
        const Icon = step.icon;
        const isCompleted = idx < currentStep;
        const isActive = idx === currentStep;
        return (
          <div
            key={idx}
            className={cn(
              "relative flex items-center gap-3.5 rounded-2xl border p-4 transition-all duration-300",
              isCompleted
                ? "border-emerald-250 bg-emerald-50/10 text-emerald-800 dark:border-emerald-950/40 dark:bg-emerald-950/5 dark:text-emerald-350 shadow-3xs"
                : isActive
                ? "border-primary bg-primary/[0.03] text-primary shadow-2xs font-semibold ring-1 ring-primary/20 scale-[1.01]"
                : "border-slate-200 bg-white text-slate-500 dark:border-slate-805 dark:bg-slate-900/60"
            )}
          >
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-sm transition-all duration-300",
                isCompleted
                  ? "border-emerald-500 bg-emerald-500 text-white shadow-3xs"
                  : isActive
                  ? "border-primary bg-primary text-white shadow-sm"
                  : "border-slate-200 bg-slate-50 dark:border-slate-850 dark:bg-slate-950 text-slate-400"
              )}
            >
              <Icon className={cn("h-4.5 w-4.5", isActive && "animate-pulse")} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-extrabold leading-none tracking-tight">{step.label}</div>
              <div className="text-[10px] text-slate-455 dark:text-slate-500 leading-tight mt-1.5 font-medium">{step.desc}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AckReconcileUpload() {
  const router = useRouter();
  const { t } = useTranslation("complaints");
  const [files, setFiles] = React.useState<File[]>([]);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<AckBatchProgress | null>(null);
  const [dragActive, setDragActive] = React.useState(false);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(e.target.files ?? []));
    setError(null);
    e.target.value = "";
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const pdfs = Array.from(e.dataTransfer.files).filter(
        (f) => f.type === "application/pdf" || f.type.startsWith("image/")
      );
      if (pdfs.length > 0) {
        setFiles(pdfs);
        setError(null);
      } else {
        setError("Only PDF scans and page images are supported.");
      }
    }
  };

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
        setError(data.error || t("advanced.ack.uploadFailedHttp", { status: res.status }));
        setPhase("error");
        return;
      }
      setPhase("processing");
      void poll(data.batchId);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("advanced.ack.uploadFailedGeneric"));
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
      { id: "upload", label: t("advanced.ack.timelineUploadLabel"), status: isProcessing ? "complete" : "active", desc: "Batch stored in database" },
      { id: "ocr", label: t("advanced.ack.timelineOcrLabel"), status: isProcessing ? (pct > 50 ? "complete" : "active") : "pending", desc: "Recognizing Kannada and English text" },
      { id: "extract", label: t("advanced.ack.timelineExtractLabel"), status: isProcessing ? (pct > 75 ? "complete" : pct > 50 ? "active" : "pending") : "pending", desc: "Locating reference keys and codes" },
      { id: "match", label: t("advanced.ack.timelineMatchLabel"), status: isProcessing ? (pct === 100 ? "complete" : pct > 75 ? "active" : "pending") : "pending", desc: "Mapping against active complaints list" },
    ];

    const estVal = isUploading 
      ? t("advanced.ack.calculating") 
      : t("advanced.ack.secondsRemaining", { seconds: Math.max(5, Math.ceil((progress?.pageCount || 10) - (progress?.processedPages || 0)) * 1.5) });

    return (
      <div className="space-y-6">
        <AckWorkflowStepper currentStep={isProcessing ? 1 : 0} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 border border-slate-200 bg-white dark:border-slate-805 dark:bg-slate-900 shadow-3xs rounded-2xl overflow-hidden">
            <CardContent className="flex flex-col items-center justify-center p-8 text-center min-h-[340px]">
              <div className="relative mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-xl animate-pulse" />
                <Loader2 className="h-7 w-7 animate-spin relative" />
              </div>
              
              <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100">
                {isUploading ? t("advanced.ack.uploadingTitle") : progress?.stage || t("advanced.ack.analyzingFallback")}
              </h3>
              
              <p className="text-xs text-slate-550 dark:text-slate-400 mt-2.5 max-w-sm font-medium leading-relaxed">
                {isUploading
                  ? t("advanced.ack.uploadingDesc")
                  : progress?.message || t("advanced.ack.extractingFallback")}
              </p>

              <div className="w-full max-w-sm mt-7 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-350">
                  <span>{t("advanced.ack.progressLabel")}</span>
                  <span>{pct}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200/20">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-500 ease-out shadow-sm"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {progress && (
                  <div className="flex justify-between text-[10px] text-slate-455 dark:text-slate-500 font-bold mt-1">
                    <span>{t("advanced.ack.pagesParsed", { processed: progress.processedPages, total: progress.pageCount })}</span>
                    <span>{t("advanced.ack.matchesFound", { count: progress.itemCount })}</span>
                  </div>
                )}
              </div>

              <div className="mt-7 flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-950 px-4 py-2.5 border border-slate-100 dark:border-slate-850 shadow-3xs">
                <Clock3 className="h-4.5 w-4.5 text-slate-450 animate-pulse" />
                <span className="text-[11px] text-slate-600 dark:text-slate-455 font-bold">
                  {t("advanced.ack.estimatedTimeLabel", { value: estVal })}
                </span>
              </div>

              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-5 font-medium leading-relaxed max-w-xs">
                {t("advanced.ack.safeToCloseTab")}
              </p>
            </CardContent>
          </Card>

          {/* AI Workflow Processing Timeline */}
          <Card className="border border-slate-200 bg-white dark:border-slate-850 dark:bg-slate-900/60 shadow-3xs rounded-2xl p-5">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-350 mb-5 flex items-center gap-2">
              <Sparkles className="h-4.5 w-4.5 text-indigo-500" />
              {t("advanced.ack.aiPipelineProgress")}
            </h4>
            <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2.5 before:bottom-2.5 before:w-0.5 before:bg-slate-100 dark:before:bg-slate-800">
              {timelineSteps.map((s, idx) => {
                const isDone = s.status === "complete";
                const isActive = s.status === "active";
                return (
                  <div key={s.id} className="relative flex items-start gap-3">
                    <div
                      className={cn(
                        "absolute -left-6 flex h-4.5 w-4.5 items-center justify-center rounded-full border text-[9px] font-bold transition-all duration-300 shadow-3xs",
                        isDone
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : isActive
                          ? "border-primary bg-primary text-white scale-110 ring-4 ring-primary/10"
                          : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 text-slate-400"
                      )}
                    >
                      {isDone ? <Check className="h-2.5 w-2.5 stroke-[3.5]" /> : idx + 1}
                    </div>
                    <div>
                      <p className={cn("text-xs font-bold transition-colors duration-200", isDone ? "text-slate-700 dark:text-slate-300" : isActive ? "text-primary" : "text-slate-450 dark:text-slate-500")}>
                        {s.label}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 leading-normal font-medium">
                        {isDone ? t("advanced.ack.stepCompleted") : isActive ? t("advanced.ack.workingOnThisNow") : t("advanced.ack.waitingToStart")}
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

      <Card className="border border-slate-200 bg-white dark:border-slate-805 dark:bg-slate-900 shadow-3xs rounded-2xl overflow-hidden">
        <CardContent className="p-6 space-y-6">
          {error && (
            <div className="flex gap-2.5 rounded-xl border border-rose-250 bg-rose-50/20 p-3.5 text-xs text-rose-600 dark:border-rose-950/40 dark:bg-rose-950/10 dark:text-rose-455">
              <AlertTriangle className="h-4.5 w-4.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/20 p-4 dark:border-slate-800 dark:bg-slate-950/30">
            <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-blue-600 dark:text-blue-500 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-855 dark:text-slate-200">{t("advanced.ack.scanInstructionsTitle")}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                {t("advanced.ack.scanInstructionsDesc")}
              </p>
            </div>
          </div>

          <label
            htmlFor="ack-file"
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3.5 rounded-2xl border-2 border-dashed px-4 py-14 text-center transition-all duration-300 group relative select-none",
              dragActive
                ? "border-primary bg-primary/[0.04] dark:bg-primary/[0.03] scale-[1.01] shadow-md shadow-primary/5"
                : "border-slate-200 bg-slate-50/30 hover:border-slate-350 hover:bg-slate-50/70 dark:border-slate-805 dark:bg-slate-950/20 dark:hover:bg-slate-900/40"
            )}
          >
            <div className="absolute inset-0 rounded-2xl bg-primary/[0.01] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className={cn(
              "flex h-12 w-12 items-center justify-center rounded-xl bg-white dark:bg-slate-950 border border-slate-150/80 dark:border-slate-850 shadow-3xs transition-all duration-300",
              dragActive ? "scale-115 border-primary text-primary" : "group-hover:scale-105"
            )}>
              <UploadCloud className={cn("h-5.5 w-5.5 text-slate-450 transition-colors duration-200", dragActive ? "text-primary animate-bounce" : "group-hover:text-primary")} />
            </div>
            <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
              {dragActive ? "Drop scan to begin upload" : t("advanced.ack.dragDropTitle")}
            </span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">{t("advanced.ack.dragDropHint")}</span>
            <input id="ack-file" type="file" accept="application/pdf,image/*" className="hidden" onChange={onPick} />
          </label>

          {files.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{t("advanced.ack.selectedFiles")}</div>
              <ul className="space-y-2">
                {files.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 rounded-xl border border-slate-150 bg-white px-3.5 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 shadow-3xs hover:border-slate-350 transition-colors"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-50 dark:bg-slate-950 border text-slate-450">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-750 dark:text-slate-300 truncate">{f.name}</div>
                      <div className="text-[10px] text-slate-400 font-bold mt-0.5">{(f.size / 1_048_576).toFixed(2)} MB</div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-400 hover:text-rose-500 rounded-lg cursor-pointer"
                      onClick={() => removeFile(i)}
                    >
                      <Trash2 className="h-4.5 w-4.5" />
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
              className="h-10 font-extrabold px-5 gap-2 rounded-xl cursor-pointer shadow-3xs hover:scale-[1.01] transition-transform"
            >
              <Sparkles className="h-4 w-4" />
              {t("advanced.ack.uploadAndDetect")}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
