"use client";

import * as React from "react";
import { Loader2, Eye, ArrowLeftRight, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import { scanDivisionVisualDuplicatesAction } from "@/lib/actions/job-photo-dedupe";
import { getJobAction, cancelJobAction } from "@/lib/actions/jobs";
import type { DupPhoto, VisualScanResult } from "@/lib/forensic/job-photo-dedupe";

function photoHref(p: DupPhoto): string {
  return p.source === "complaint" && p.complaintId
    ? `/complaints/${p.complaintId}`
    : `/complaints/job/${encodeURIComponent(p.jobNumber)}/dossier`;
}

function MatchPhoto({ p }: { p: DupPhoto }) {
  return (
    <Link href={photoHref(p)} className="group relative shrink-0" title={p.fileName ?? p.jobNumber}>
      {p.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.url} alt={p.jobNumber} className="h-28 w-28 rounded-md border object-cover transition group-hover:opacity-90" />
      ) : (
        <div className="flex h-28 w-28 items-center justify-center rounded-md border bg-muted text-[10px] text-muted-foreground">
          no preview
        </div>
      )}
      <span className="absolute inset-x-0 bottom-0 truncate rounded-b-md bg-black/60 px-1 py-0.5 text-center font-mono text-[9px] text-white">
        {p.jobNumber}
      </span>
    </Link>
  );
}

/**
 * On-demand VISUAL duplicate scan (the print→scan case hashes miss). Pick a
 * division and let the vision model compare photos across different job codes.
 */
export function VisualDupScan({ divisions }: { divisions: string[] }) {
  const [division, setDivision] = React.useState(divisions[0] ?? "");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<VisualScanResult | null>(null);
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<{ pct: number | null; message: string | null }>({ pct: null, message: null });
  const activeRef = React.useRef(true);
  React.useEffect(() => () => { activeRef.current = false; }, []);

  // Runs as a background job now — up to 60 sequential vision-API calls that
  // used to block this button (and die if the user navigated away) instead
  // keep running server-side; this just polls for progress + the final result.
  async function run() {
    if (!division) return;
    setBusy(true);
    setResult(null);
    setProgress({ pct: null, message: null });
    const started = await scanDivisionVisualDuplicatesAction(division);
    if (!started.ok || !started.jobId) {
      if (activeRef.current) {
        setResult({ ok: false, comparisons: 0, cached: 0, matches: [], capped: false, error: started.error ?? "Could not start the scan." });
        setBusy(false);
      }
      return;
    }
    setJobId(started.jobId);
    poll(started.jobId);
  }

  function poll(id: string) {
    setTimeout(async () => {
      const r = await getJobAction(id);
      if (!activeRef.current) return;
      const job = r.job;
      if (!job) {
        setResult({ ok: false, comparisons: 0, cached: 0, matches: [], capped: false, error: r.error ?? "Scan not found." });
        setBusy(false);
        return;
      }
      if (job.status === "done") {
        setResult(job.result as VisualScanResult);
        setBusy(false);
        setJobId(null);
        return;
      }
      if (job.status === "failed" || job.status === "cancelled") {
        setResult({ ok: false, comparisons: 0, cached: 0, matches: [], capped: false, error: job.error ?? "Scan cancelled." });
        setBusy(false);
        setJobId(null);
        return;
      }
      const r2 = job.result as { message?: string } | null;
      setProgress({ pct: job.progress ?? null, message: r2?.message ?? null });
      poll(id);
    }, 1200);
  }

  async function cancel() {
    if (!jobId) return;
    await cancelJobAction(jobId);
  }

  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Eye className="h-4 w-4" /> Visual scan (printed-then-scanned photos)
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Hash matching misses a photo that was printed on a document and re-scanned. This asks the vision model to
        compare photos across different job codes in one division. Verdicts are cached so each pair is judged once.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={division}
          onChange={(e) => setDivision(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          {divisions.length === 0 && <option value="">(no divisions)</option>}
          {divisions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <Button type="button" size="sm" onClick={run} disabled={busy || !division}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4 mr-1" />}
          {busy ? "Scanning…" : "Scan visually"}
        </Button>
        {busy && jobId && (
          <Button type="button" size="sm" variant="outline" onClick={cancel}>
            <Ban className="h-4 w-4" /> Cancel
          </Button>
        )}
      </div>

      {busy && (
        <div className="mt-3 space-y-1">
          <Progress value={progress.pct ?? undefined} indeterminate={progress.pct == null} />
          <p className="text-[11px] text-muted-foreground">
            {progress.message ?? "Starting…"} — safe to navigate away, this keeps running and you can check back or watch it from the Task Center.
          </p>
        </div>
      )}

      {!busy && result && (
        <div className="mt-3 text-sm">
          {result.error ? (
            <p className="text-rose-600 dark:text-rose-400">{result.error}</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {result.comparisons} compared by AI · {result.cached} from cache · {result.matches.length} visual match
                {result.matches.length === 1 ? "" : "es"}
                {result.capped ? " · (capped — re-run to cover more pairs)" : ""}
              </p>
              <ul className="mt-2 space-y-2">
                {result.matches.map((m, i) => (
                  <li key={i} className="rounded-lg border border-rose-200/50 bg-rose-50/20 p-2.5 dark:border-rose-900/40 dark:bg-rose-950/20">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                      <span className="font-mono">{m.a.jobNumber}</span>
                      <ArrowLeftRight className="h-3.5 w-3.5 text-rose-500" />
                      <span className="font-mono">{m.b.jobNumber}</span>
                      {m.sameDivision && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                          same division
                        </span>
                      )}
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        {m.confidence}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <MatchPhoto p={m.a} />
                      <ArrowLeftRight className="h-4 w-4 shrink-0 text-rose-400" />
                      <MatchPhoto p={m.b} />
                    </div>
                    {m.sharedDetails && <p className="mt-1.5 text-xs text-muted-foreground">{m.sharedDetails}</p>}
                  </li>
                ))}
                {result.matches.length === 0 && <li className="text-xs text-muted-foreground">No visual duplicates found in this division.</li>}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
