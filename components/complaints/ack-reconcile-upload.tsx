"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, UploadCloud, FileText, Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AckBatchProgress } from "@/lib/complaints/ack-reconcile";

type Phase = "idle" | "uploading" | "processing" | "error";

/**
 * Upload a big scanned PDF of many BBMP acknowledgments. Posts to the ack-import
 * Route Handler (background processing), then polls progress until the batch is
 * ready and redirects to its review screen.
 */
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

  async function poll(batchId: string) {
    // Poll every 2.5s until the batch leaves `processing`.
    for (;;) {
      await new Promise((r) => setTimeout(r, 2500));
      let res: Response;
      try {
        res = await fetch(`/api/ack-import/${batchId}`, { cache: "no-store" });
      } catch {
        continue; // transient; keep trying
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

  if (phase === "uploading" || phase === "processing") {
    const pct =
      progress && progress.pageCount > 0
        ? Math.min(100, Math.round((progress.processedPages / progress.pageCount) * 100))
        : null;
    return (
      <Card className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm rounded-xl">
        <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium">
            {phase === "uploading" ? "Uploading the scanned PDF…" : progress?.stage || "Processing…"}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
            {phase === "uploading"
              ? "Large scans take a moment to upload."
              : progress?.message || "Rendering pages, reading text, and matching to complaints…"}
          </p>
          {pct !== null && (
            <div className="w-full max-w-sm">
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                {progress?.processedPages ?? 0}/{progress?.pageCount ?? 0} pages · {progress?.itemCount ?? 0} acknowledgment(s) so far
              </p>
            </div>
          )}
          <p className="text-[11px] text-slate-400">You can leave this page — processing continues in the background.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm rounded-xl">
      <CardContent className="p-6 space-y-5">
        {error && <p className="rounded-lg border border-rose-200/30 bg-rose-50/10 p-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-100 bg-amber-50/30 p-3.5 dark:border-slate-800 dark:bg-slate-950/30">
          <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Upload one big scanned PDF containing <strong>many BBMP acknowledgments</strong> (proof of receipt). The system splits it into
            individual acknowledgments, reads the job code / complaint number / subject on each, and proposes which existing complaint it belongs to.
            You then <strong>review and confirm every match</strong> before anything is attached. Very large scans (300+ MB) should be split into a few files.
          </p>
        </div>
        <label
          htmlFor="ack-file"
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/40 px-4 py-10 text-center transition-colors hover:border-primary/50 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950/30 dark:hover:bg-slate-900/50"
        >
          <UploadCloud className="h-8 w-8 text-slate-400" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Choose the acknowledgments PDF</span>
          <span className="text-xs text-slate-400">PDF or images — one file with many acknowledgments</span>
          <input id="ack-file" type="file" accept="application/pdf,image/*" multiple className="hidden" onChange={onPick} />
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
          <Button type="button" onClick={start} disabled={files.length === 0} className="h-10 font-bold">
            <Sparkles className="h-4 w-4 mr-1.5" /> Upload &amp; detect acknowledgments
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
