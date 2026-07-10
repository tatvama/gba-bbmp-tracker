"use client";

import * as React from "react";
import Link from "next/link";
import {
  Loader2, UploadCloud, FileText, AlertTriangle, CheckCircle2,
  HelpCircle, Trash2, ArrowRight, ShieldQuestion, BadgeCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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

/**
 * Second acknowledgment-upload path: each file is already ONE acknowledgment,
 * named with its job number (e.g. "047-25-000003.pdf"). Matching is a plain
 * filename→job_number lookup (no AI/OCR) and an unambiguous match attaches
 * immediately — no review screen, unlike the bulk mixed-PDF flow above.
 */
export function AckByFilenameUpload() {
  const [files, setFiles] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ByJobNumberResponse | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
    setError(null);
    e.target.value = "";
  }

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
        setError(data.error || `Upload failed (HTTP ${res.status}).`);
        return;
      }
      setResult(data);
      setFiles([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-3xs rounded-2xl overflow-hidden">
      <CardContent className="p-6 space-y-5">
        <div>
          <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Attach by Job Number (filename match)</h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            Already have each acknowledgment as its own scan, named with the job number (e.g. <span className="font-mono">047-25-000003.pdf</span>)?
            Upload them here — no AI needed. A file attaches automatically the moment its job number matches exactly one case.
          </p>
        </div>

        {error && (
          <div className="flex gap-2.5 rounded-xl border border-rose-200 bg-rose-50/20 p-3.5 text-xs text-rose-600 dark:border-rose-950/40 dark:bg-rose-950/10 dark:text-rose-450">
            <AlertTriangle className="h-4.5 w-4.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <label
          htmlFor="ack-by-job-number-file"
          className="flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/30 px-4 py-8 text-center transition-all hover:border-primary/50 hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950/20 dark:hover:bg-slate-900/40 group"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-150/80 dark:border-slate-850 shadow-3xs group-hover:scale-105 transition-transform duration-200">
            <UploadCloud className="h-4.5 w-4.5 text-slate-450 group-hover:text-primary transition-colors" />
          </div>
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Drop individual acknowledgment scans</span>
          <span className="text-[10px] text-slate-400">PDF, JPG, PNG — pick as many as you like, one job number each.</span>
          <input id="ack-by-job-number-file" type="file" accept="application/pdf,image/*" multiple className="hidden" onChange={onPick} />
        </label>

        {files.length > 0 && (
          <ul className="space-y-2">
            {files.map((f, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-xl border border-slate-150 bg-white px-3 py-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 shadow-3xs"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-50 dark:bg-slate-950 border text-slate-400">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1 font-semibold text-slate-750 dark:text-slate-300 truncate">{f.name}</div>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-rose-500 rounded-lg" onClick={() => removeFile(i)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end border-t border-slate-100 dark:border-slate-850 pt-4">
          <Button type="button" onClick={start} disabled={files.length === 0 || busy} className="h-10 font-extrabold px-5 gap-2 rounded-xl">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {busy ? "Matching…" : "Upload & attach"}
          </Button>
        </div>

        {result && (
          <div className="space-y-3 border-t border-slate-100 dark:border-slate-850 pt-4">
            {result.attached.length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/20 dark:border-emerald-950/40 dark:bg-emerald-950/10 p-3.5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" /> Attached ({result.attached.length})
                </div>
                <ul className="space-y-1">
                  {result.attached.map((a) => (
                    <li key={a.complaintId + a.fileName} className="text-[11px] text-slate-600 dark:text-slate-400">
                      <span className="font-mono">{a.fileName}</span> → job {a.jobNumber} ·{" "}
                      <Link href={`/complaints/${a.complaintId}`} className="text-primary font-semibold hover:underline">
                        {a.caseNumber || "View case"}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.alreadyAcknowledged?.length > 0 && (
              <div className="rounded-xl border border-sky-200 bg-sky-50/30 dark:border-sky-950/40 dark:bg-sky-950/10 p-3.5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-sky-700 dark:text-sky-400">
                  <BadgeCheck className="h-4 w-4" /> Already acknowledged — skipped ({result.alreadyAcknowledged.length})
                </div>
                <ul className="space-y-1">
                  {result.alreadyAcknowledged.map((a) => (
                    <li key={a.complaintId + a.fileName} className="text-[11px] text-slate-600 dark:text-slate-400">
                      <span className="font-mono">{a.fileName}</span> — job {a.jobNumber} is already acknowledged on{" "}
                      <Link href={`/complaints/${a.complaintId}`} className="text-primary font-semibold hover:underline">
                        {a.caseNumber || "this case"}
                      </Link>
                      , so nothing was attached again.
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.ambiguous.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/20 dark:border-amber-950/40 dark:bg-amber-950/10 p-3.5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-400">
                  <ShieldQuestion className="h-4 w-4" /> Ambiguous — attach manually ({result.ambiguous.length})
                </div>
                <ul className="space-y-1.5">
                  {result.ambiguous.map((a) => (
                    <li key={a.fileName} className="text-[11px] text-slate-600 dark:text-slate-400">
                      <span className="font-mono">{a.fileName}</span> — job {a.jobNumber} matches {a.candidates.length} cases:{" "}
                      {a.candidates.map((c, i) => (
                        <React.Fragment key={c.complaintId}>
                          {i > 0 && ", "}
                          <Link href={`/complaints/${c.complaintId}`} className="text-primary font-semibold hover:underline">
                            {c.caseNumber || c.title || "case"}
                          </Link>
                        </React.Fragment>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.unmatched.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/30 p-3.5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400">
                  <HelpCircle className="h-4 w-4" /> No matching case ({result.unmatched.length})
                </div>
                <ul className="space-y-1">
                  {result.unmatched.map((u) => (
                    <li key={u.fileName} className="text-[11px] text-slate-500 dark:text-slate-450">
                      <span className="font-mono">{u.fileName}</span> — job {u.jobNumber} isn&apos;t on any case yet.
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.invalid.length > 0 && (
              <div className="rounded-xl border border-rose-200 bg-rose-50/20 dark:border-rose-950/40 dark:bg-rose-950/10 p-3.5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-rose-600 dark:text-rose-450">
                  <AlertTriangle className="h-4 w-4" /> Couldn&apos;t attach ({result.invalid.length})
                </div>
                <ul className="space-y-1">
                  {result.invalid.map((v) => (
                    <li key={v.fileName} className="text-[11px] text-slate-500 dark:text-slate-450">
                      <span className="font-mono">{v.fileName}</span> — {v.reason}
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
