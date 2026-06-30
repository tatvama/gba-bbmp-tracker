"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2,
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Check,
  X,
  Sparkles,
  FolderArchive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getForensicImportBatchAction, commitForensicImportAction } from "@/lib/actions/forensic-zip-import";
import type { ForensicFileRole, ForensicJobResult } from "@/lib/forensic/skill-output";

type Phase = "idle" | "uploading" | "analyzing" | "review" | "committing";

const RISK_STYLE: Record<string, string> = {
  Purple: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-300",
  Red: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  Orange: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  Amber: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  Green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
};

const CHECKLIST: { label: string; roles: ForensicFileRole[] }[] = [
  { label: "Extracted text", roles: ["text"] },
  { label: "Forensic JSON", roles: ["min_json", "rich_json"] },
  { label: "Kannada letter (DOCX)", roles: ["letter_docx"] },
  { label: "Letter PDF", roles: ["letter_pdf"] },
  { label: "Evidence index", roles: ["evidence_csv"] },
  { label: "Logs", roles: ["log"] },
  { label: "Portal source PDFs", roles: ["portal_pdf"] },
];

export function ForensicZipImport({ presetFile }: { presetFile?: File } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [file, setFile] = React.useState<File | null>(null);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [batchId, setBatchId] = React.useState("");
  const [jobs, setJobs] = React.useState<ForensicJobResult[]>([]);
  const [batchError, setBatchError] = React.useState<string | null>(null);
  const pollRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = React.useRef(true);

  function setImportParam(id: string | null) {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (id) params.set("import", id);
    else params.delete("import");
    const qs = params.toString();
    router.replace(qs ? `/complaints/import?${qs}` : "/complaints/import", { scroll: false });
  }

  function stopPoll() {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }

  function poll(id: string) {
    stopPoll();
    const tick = async () => {
      let res;
      try {
        res = await getForensicImportBatchAction(id);
      } catch {
        if (activeRef.current) pollRef.current = setTimeout(tick, 3000);
        return;
      }
      if (!activeRef.current) return;
      if (res.error && res.status !== "Ready") {
        setError(res.error);
        setPhase("idle");
        setImportParam(null);
        return;
      }
      if (res.status === "Ready") {
        setJobs((res.jobs || []).map((j) => ({ ...j })));
        setBatchError(res.error ?? null);
        setPhase("review");
        return;
      }
      if (res.status === "Failed") {
        setError(res.error || "Import failed — please try again.");
        setPhase("idle");
        setImportParam(null);
        return;
      }
      if (res.status === "Committed") {
        setImportParam(null);
        router.push("/complaints");
        return;
      }
      pollRef.current = setTimeout(tick, 2500); // still Processing
    };
    void tick();
  }

  React.useEffect(() => {
    activeRef.current = true;
    const existing = searchParams.get("import");
    if (existing) {
      setBatchId(existing);
      setPhase("analyzing");
      poll(existing);
    } else if (presetFile) {
      // Auto-started by the unified upload (SmartUpload already picked the .zip).
      setFile(presetFile);
      void analyze(presetFile);
    }
    return () => {
      activeRef.current = false;
      stopPoll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
    setError(null);
    e.target.value = "";
  }

  async function analyze(f: File | null = file) {
    if (!f) return;
    setPhase("uploading");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch("/api/forensic-import", { method: "POST", body: fd });
      const data = (await r.json()) as { batchId?: string; error?: string };
      if (!r.ok || !data.batchId) {
        setError(data.error || "Upload failed.");
        setPhase("idle");
        return;
      }
      setBatchId(data.batchId);
      setImportParam(data.batchId);
      setPhase("analyzing");
      poll(data.batchId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setPhase("idle");
    }
  }

  function toggleSkip(jobCode: string) {
    setJobs((prev) => prev.map((j) => (j.jobCode === jobCode ? { ...j, skip: !j.skip } : j)));
  }

  const selected = jobs.filter((j) => !j.skip && j.validCode);

  async function commit() {
    if (selected.length === 0) return;
    setPhase("committing");
    setError(null);
    try {
      const res = await commitForensicImportAction({ batchId, jobs });
      if (res.error || !res.success) {
        setError(res.error || "Could not create the complaints.");
        setPhase("review");
        return;
      }
      const failed = (res.perJob || []).filter((p) => p.error);
      stopPoll();
      setImportParam(null);
      if (failed.length) {
        setError(`${failed.length} job(s) failed: ${failed.map((f) => `${f.jobCode} (${f.error})`).join("; ")}`);
        setPhase("review");
        return;
      }
      router.push("/complaints");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Commit failed");
      setPhase("review");
    }
  }

  function reset() {
    stopPoll();
    setImportParam(null);
    setFile(null);
    setJobs([]);
    setBatchId("");
    setError(null);
    setBatchError(null);
    setPhase("idle");
  }

  // ── Busy ───────────────────────────────────────────────────────────────────
  if (phase === "uploading" || phase === "analyzing" || phase === "committing") {
    return (
      <Card className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm rounded-xl">
        <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium animate-pulse">
            {phase === "uploading"
              ? "Uploading the ZIP…"
              : phase === "analyzing"
                ? "Unzipping and reading each job folder…"
                : "Creating a job case + complaint per job code…"}
          </p>
          <p className="text-xs text-muted-foreground max-w-md">
            {phase === "committing"
              ? "Storing files, mapping the forensic findings, and attaching the drafted letter."
              : "Folders are read, the forensic JSON parsed, and the drafted letter previewed. This runs in the background — it's safe to refresh; you'll pick up right here."}
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Review ───────────────────────────────────────────────────────────────────
  if (phase === "review") {
    return (
      <Card className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm rounded-xl overflow-hidden">
        <CardContent className="p-6 space-y-5">
          {error && (
            <p className="rounded-lg border border-rose-250/30 bg-rose-50/10 p-3.5 text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
          {batchError && (
            <p className="rounded-lg border border-amber-200/40 bg-amber-50/20 p-3 text-xs text-amber-700 dark:text-amber-400">
              {batchError}
            </p>
          )}

          <div className="flex items-start gap-2.5 rounded-lg border border-blue-100 bg-blue-50/30 p-3.5 dark:border-slate-800 dark:bg-slate-950/30">
            <FolderArchive className="h-4.5 w-4.5 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {jobs.length} job folder{jobs.length === 1 ? "" : "s"} found
              </span>
              . Each selected job becomes a forensic job case + a linked Complaint with the drafted
              letter attached. Untick any you don&apos;t want, then commit.
            </div>
          </div>

          <div className="space-y-3">
            {jobs.map((j) => {
              const present = new Set(j.files.map((f) => f.role));
              const summary = j.dataset;
              const sourceBadge =
                j.source === "json"
                  ? { text: "Forensic JSON", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" }
                  : j.source === "ai-from-letter"
                    ? { text: "AI-derived — verify", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" }
                    : { text: "No forensic data", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" };
              return (
                <div
                  key={j.jobCode}
                  className={`rounded-lg border p-4 transition-colors ${
                    j.skip || !j.validCode
                      ? "border-slate-200 bg-slate-50/60 opacity-60 dark:border-slate-800 dark:bg-slate-950/20"
                      : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/30"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <input
                      type="checkbox"
                      checked={!j.skip && j.validCode}
                      disabled={!j.validCode}
                      onChange={() => toggleSkip(j.jobCode)}
                      className="h-4 w-4 accent-primary"
                      title={j.validCode ? "Include this job" : "Not a valid job code — cannot import"}
                    />
                    <span className="font-mono text-sm font-bold text-slate-800 dark:text-slate-200">{j.jobCode}</span>
                    {!j.validCode && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                        invalid code
                      </span>
                    )}
                    {j.riskColour && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${RISK_STYLE[j.riskColour] ?? ""}`}>
                        {j.riskColour}
                      </span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${sourceBadge.cls}`}>
                      {sourceBadge.text}
                    </span>
                    {j.alreadyImported && (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                        already imported · will refresh
                      </span>
                    )}
                  </div>

                  {/* present / missing checklist */}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
                    {CHECKLIST.map((c) => {
                      const ok = c.roles.some((r) => present.has(r));
                      return (
                        <span
                          key={c.label}
                          className={`inline-flex items-center gap-1 text-[11px] ${
                            ok ? "text-emerald-700 dark:text-emerald-400" : "text-slate-400 dark:text-slate-600"
                          }`}
                        >
                          {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                          {c.label}
                        </span>
                      );
                    })}
                  </div>

                  {summary && (
                    <div className="text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                      {summary.work && (
                        <p>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">Work:</span> {summary.work}
                        </p>
                      )}
                      {summary.contractor && (
                        <p>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">Contractor:</span>{" "}
                          {typeof summary.contractor === "string"
                            ? summary.contractor
                            : [summary.contractor.name, summary.contractor.class ? `(${summary.contractor.class})` : ""].filter(Boolean).join(" ")}
                        </p>
                      )}
                      {summary.treasury_loss_total && (
                        <p>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">Possible loss:</span>{" "}
                          {summary.treasury_loss_total}
                        </p>
                      )}
                      {summary.summary && <p className="text-slate-500 dark:text-slate-500">{summary.summary}</p>}
                    </div>
                  )}

                  {j.letterText && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                        Preview drafted letter
                      </summary>
                      <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-slate-150 bg-slate-50/60 p-2 text-[11px] leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                        {j.letterText.slice(0, 600)}
                        {j.letterText.length > 600 ? "…" : ""}
                      </pre>
                      <p className="mt-1 text-[10px] text-slate-400">
                        The drafted DOCX/PDF will be attached to the complaint as the printable letter.
                      </p>
                    </details>
                  )}

                  {j.missing.length > 0 && (
                    <p className="mt-2 flex items-start gap-1 text-[11px] text-amber-600 dark:text-amber-500">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                      Missing: {j.missing.join(", ")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-150 dark:border-slate-800/85 pt-4">
            <Button type="button" variant="outline" onClick={reset} className="h-10">
              Start over
            </Button>
            <Button type="button" onClick={commit} disabled={selected.length === 0} className="h-10 font-bold">
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Create {selected.length} complaint{selected.length === 1 ? "" : "s"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Idle ───────────────────────────────────────────────────────────────────
  return (
    <Card className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm rounded-xl overflow-hidden">
      <CardContent className="p-6 space-y-5">
        {error && (
          <p className="rounded-lg border border-rose-250/30 bg-rose-50/10 p-3.5 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}

        <div className="flex items-start gap-2.5 rounded-lg border border-amber-100 bg-amber-50/30 p-3.5 dark:border-slate-800 dark:bg-slate-950/30">
          <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Upload the ZIP produced by the forensic-audit skill, with{" "}
            <span className="font-semibold">one top-level folder per job code</span> (e.g.{" "}
            <span className="font-mono">047-25-000003/</span>). Each folder&apos;s extracted text, forensic JSON,
            and drafted letter are read; after your review, each job becomes a complaint with the letter attached.
          </p>
        </div>

        <label
          htmlFor="forensic-zip-file"
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-250 bg-slate-50/40 px-4 py-10 text-center transition-colors hover:border-primary/50 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950/30 dark:hover:bg-slate-900/50"
        >
          <UploadCloud className="h-8 w-8 text-slate-400" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Choose a .zip file</span>
          <span className="text-xs text-slate-400">One folder per job code inside</span>
          <input id="forensic-zip-file" type="file" accept=".zip,application/zip" className="hidden" onChange={onPick} />
        </label>

        {file && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-150 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="truncate">{file.name}</span>
            <span className="ml-auto shrink-0 text-slate-400">{(file.size / 1_048_576).toFixed(1)} MB</span>
          </div>
        )}

        <div className="flex justify-end border-t border-slate-150 dark:border-slate-800/85 pt-4">
          <Button type="button" onClick={() => analyze()} disabled={!file} className="h-10 font-bold">
            <Sparkles className="h-4 w-4 mr-1.5" />
            Analyze ZIP
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
