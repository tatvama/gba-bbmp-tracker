"use client";

import * as React from "react";
import Link from "next/link";
import {
  Loader2, UploadCloud, FileText, AlertTriangle, CheckCircle2,
  HelpCircle, Trash2, ArrowRight, ShieldQuestion, BadgeCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

interface AttachedResult { fileName: string; complaintId: string; caseNumber: string | null; jobNumber: string }
interface UnmatchedResult { fileName: string; jobNumber: string }
interface AmbiguousResult { fileName: string; jobNumber: string; candidates: { complaintId: string; caseNumber: string | null; title: string | null }[] }
interface AlreadyAckResult { fileName: string; complaintId: string; caseNumber: string | null; jobNumber: string }
interface InvalidResult { fileName: string; reason: string }
interface ByJobNumberResponse {
  attached: AttachedResult[];
  unmatched: UnmatchedResult[];
  ambiguous: AmbiguousResult[];
  alreadyAcknowledged: AlreadyAckResult[];
  invalid: InvalidResult[];
  error?: string;
}

export function AckByFilenameUpload() {
  const { t } = useTranslation("complaints");
  
  const [files, setFiles] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ByJobNumberResponse | null>(null);
  const [dragActive, setDragActive] = React.useState(false);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
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
        setFiles((prev) => [...prev, ...pdfs]);
        setError(null);
      }
    }
  };

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function start() {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/ack-import/by-job-number", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as ByJobNumberResponse;
      if (!res.ok) {
        setError(data.error || t("advanced.ack.uploadFailedHttp", { status: res.status }));
        return;
      }
      setResult(data);
      setFiles([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("advanced.ack.uploadFailedGeneric"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border border-slate-200 bg-white dark:border-slate-805 dark:bg-slate-900 shadow-3xs rounded-2xl overflow-hidden">
      <CardContent className="p-6 space-y-6">
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-350">{t("advanced.ack.byFilenameTitle")}</h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed font-medium">
            {t("advanced.ack.byFilenameDescPre")}{" "}
            <span className="font-mono bg-slate-50 dark:bg-slate-955 border border-slate-100 dark:border-slate-850 px-1.5 py-0.5 rounded text-[10px] text-indigo-600 dark:text-indigo-400 font-bold">047-25-000003.pdf</span>
            {t("advanced.ack.byFilenameDescPost")}
          </p>
        </div>

        {error && (
          <div className="flex gap-2.5 rounded-xl border border-rose-250 bg-rose-50/20 p-3.5 text-xs text-rose-600 dark:border-rose-950/40 dark:bg-rose-950/10 dark:text-rose-455">
            <AlertTriangle className="h-4.5 w-4.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <label
          htmlFor="ack-by-job-number-file"
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-3.5 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-all duration-300 group relative select-none",
            dragActive
              ? "border-primary bg-primary/[0.04] dark:bg-primary/[0.03] scale-[1.01] shadow-md shadow-primary/5"
              : "border-slate-200 bg-slate-50/30 hover:border-slate-350 hover:bg-slate-50/70 dark:border-slate-805 dark:bg-slate-950/20 dark:hover:bg-slate-900/40"
          )}
        >
          <div className="absolute inset-0 rounded-2xl bg-primary/[0.01] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className={cn(
            "flex h-11 w-11 items-center justify-center rounded-xl bg-white dark:bg-slate-950 border border-slate-150/80 dark:border-slate-850 shadow-3xs transition-all duration-300",
            dragActive ? "scale-110 border-primary text-primary" : "group-hover:scale-105"
          )}>
            <UploadCloud className="h-4.5 w-4.5 text-slate-450 group-hover:text-primary transition-colors" />
          </div>
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
            {dragActive ? "Drop files to add" : t("advanced.ack.dropIndividualScans")}
          </span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">{t("advanced.ack.dropIndividualScansHint")}</span>
          <input id="ack-by-job-number-file" type="file" accept="application/pdf,image/*" multiple className="hidden" onChange={onPick} />
        </label>

        {files.length > 0 && (
          <ul className="space-y-2">
            {files.map((f, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-xl border border-slate-150 bg-white px-3.5 py-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 shadow-3xs hover:border-slate-300 transition-colors"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-50 dark:bg-slate-950 border text-slate-450">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1 font-bold text-slate-755 dark:text-slate-300 truncate">{f.name}</div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-400 hover:text-rose-500 rounded-lg cursor-pointer"
                  onClick={() => removeFile(i)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end border-t border-slate-100 dark:border-slate-850 pt-4">
          <Button
            type="button"
            onClick={start}
            disabled={files.length === 0 || busy}
            className="h-10 font-extrabold px-5 gap-2 rounded-xl cursor-pointer shadow-3xs hover:scale-[1.01] transition-transform"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {busy ? t("advanced.ack.matching") : t("advanced.ack.uploadAndAttach")}
          </Button>
        </div>

        {result && (
          <div className="space-y-4 border-t border-slate-100 dark:border-slate-850 pt-4">
            {result.attached.length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/15 dark:border-emerald-950/40 dark:bg-emerald-950/10 p-4 space-y-2.5 shadow-3xs">
                <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {t("advanced.ack.attachedHeading", { count: result.attached.length })}
                </div>
                <ul className="space-y-1.5 pl-6 list-disc text-[11px] text-slate-600 dark:text-slate-400">
                  {result.attached.map((a) => (
                    <li key={a.complaintId + a.fileName}>
                      <span className="font-mono bg-emerald-50/50 dark:bg-slate-905 border border-emerald-100/50 dark:border-slate-800 px-1 py-0.5 rounded font-medium">{a.fileName}</span>{" "}
                      {t("advanced.ack.arrowJobSeparator", { jobNumber: a.jobNumber })}{" "}
                      <Link href={`/complaints/${a.complaintId}`} className="text-primary font-bold hover:underline">
                        {a.caseNumber || t("advanced.ack.viewCase")}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {result.alreadyAcknowledged?.length > 0 && (
              <div className="rounded-xl border border-sky-200 bg-sky-50/20 dark:border-sky-950/40 dark:bg-sky-950/10 p-4 space-y-2.5 shadow-3xs">
                <div className="flex items-center gap-2 text-xs font-extrabold text-sky-700 dark:text-sky-400">
                  <BadgeCheck className="h-4 w-4 shrink-0" />
                  {t("advanced.ack.alreadyAckSkippedHeading", { count: result.alreadyAcknowledged.length })}
                </div>
                <ul className="space-y-1.5 pl-6 list-disc text-[11px] text-slate-600 dark:text-slate-400">
                  {result.alreadyAcknowledged.map((a) => (
                    <li key={a.complaintId + a.fileName}>
                      <span className="font-mono bg-sky-50/30 dark:bg-slate-905 border border-sky-100/50 dark:border-slate-800 px-1 py-0.5 rounded font-medium">{a.fileName}</span>{" "}
                      {t("advanced.ack.alreadyAckRowConnector", { jobNumber: a.jobNumber })}{" "}
                      <Link href={`/complaints/${a.complaintId}`} className="text-primary font-bold hover:underline">
                        {a.caseNumber || t("advanced.ack.alreadyAckThisCase")}
                      </Link>
                      {t("advanced.ack.alreadyAckRowSuffix")}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {result.ambiguous.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/15 dark:border-amber-950/40 dark:bg-amber-955/10 p-4 space-y-2.5 shadow-3xs">
                <div className="flex items-center gap-2 text-xs font-extrabold text-amber-700 dark:text-amber-400">
                  <ShieldQuestion className="h-4 w-4 shrink-0" />
                  {t("advanced.ack.ambiguousHeading", { count: result.ambiguous.length })}
                </div>
                <ul className="space-y-2 pl-6 list-disc text-[11px] text-slate-600 dark:text-slate-400">
                  {result.ambiguous.map((a) => (
                    <li key={a.fileName}>
                      <span className="font-mono bg-amber-50/30 dark:bg-slate-905 border border-amber-100/50 dark:border-slate-800 px-1 py-0.5 rounded font-medium">{a.fileName}</span>{" "}
                      {t("advanced.ack.ambiguousRowConnector", { jobNumber: a.jobNumber, count: a.candidates.length })}{" "}
                      <span className="inline-flex gap-1.5 flex-wrap">
                        {a.candidates.map((c, i) => (
                          <React.Fragment key={c.complaintId}>
                            {i > 0 && ", "}
                            <Link href={`/complaints/${c.complaintId}`} className="text-primary font-bold hover:underline">
                              {c.caseNumber || c.title || "case"}
                            </Link>
                          </React.Fragment>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {result.unmatched.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/20 p-4 space-y-2.5 shadow-3xs">
                <div className="flex items-center gap-2 text-xs font-extrabold text-slate-600 dark:text-slate-400">
                  <HelpCircle className="h-4 w-4 shrink-0" />
                  {t("advanced.ack.noMatchingCaseHeading", { count: result.unmatched.length })}
                </div>
                <ul className="space-y-1.5 pl-6 list-disc text-[11px] text-slate-550 dark:text-slate-450">
                  {result.unmatched.map((u) => (
                    <li key={u.fileName}>
                      <span className="font-mono bg-slate-100/50 dark:bg-slate-905 border px-1 py-0.5 rounded font-medium">{u.fileName}</span>{" "}
                      {t("advanced.ack.unmatchedRow", { jobNumber: u.jobNumber })}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {result.invalid.length > 0 && (
              <div className="rounded-xl border border-rose-200 bg-rose-50/15 dark:border-rose-955/40 dark:bg-rose-955/10 p-4 space-y-2.5 shadow-3xs">
                <div className="flex items-center gap-2 text-xs font-extrabold text-rose-600 dark:text-rose-450">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {t("advanced.ack.couldntAttachHeading", { count: result.invalid.length })}
                </div>
                <ul className="space-y-1.5 pl-6 list-disc text-[11px] text-slate-550 dark:text-slate-455">
                  {result.invalid.map((v) => (
                    <li key={v.fileName}>
                      <span className="font-mono bg-rose-50/20 dark:bg-slate-905 border border-rose-100/50 dark:border-slate-800 px-1 py-0.5 rounded font-medium">{v.fileName}</span> — {v.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
