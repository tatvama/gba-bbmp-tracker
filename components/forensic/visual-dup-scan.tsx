"use client";

import * as React from "react";
import { Loader2, Eye, ArrowLeftRight, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import { scanDivisionVisualDuplicatesAction } from "@/lib/actions/job-photo-dedupe";
import { useTask } from "@/lib/jobs/client/use-task";
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
  const [starting, setStarting] = React.useState(false);
  const [result, setResult] = React.useState<VisualScanResult | null>(null);

  // vision_scan jobs have no entityId (a division name isn't a UUID) — the
  // division is what disambiguates one scan from another, via the generic
  // `subtype` identity field (lib/jobs/adapters.ts derives it from the job's
  // own input, not from anything client-side). Resumes automatically: if a
  // scan of this division was already running before this mounted, `task`
  // reflects it immediately.
  const { task, isActive, startTask, cancel: cancelTracked } = useTask({ taskType: "vision_scan", subtype: division });
  const busy = starting || isActive;

  const prevStatusRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    const status = task?.status;
    if (status === prevStatusRef.current) return;
    prevStatusRef.current = status;
    if (!status) return;
    if (status === "done") {
      setResult(task?.result as VisualScanResult);
    } else if (status === "failed" || status === "cancelled") {
      setResult({ ok: false, comparisons: 0, cached: 0, matches: [], capped: false, error: task?.error ?? "Scan cancelled." });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.status]);

  // Runs as a background job — up to 60 sequential vision-API calls that used
  // to block this button (and die if the user navigated away) instead keep
  // running server-side; useTask above (not a poll loop owned by this
  // component) reflects progress from the shared Task Registry.
  async function run() {
    if (!division) return;
    setStarting(true);
    setResult(null);
    const started = await scanDivisionVisualDuplicatesAction(division);
    setStarting(false);
    if (!started.ok || !started.jobId) {
      setResult({ ok: false, comparisons: 0, cached: 0, matches: [], capped: false, error: started.error ?? "Could not start the scan." });
      return;
    }
    startTask(started.jobId);
  }

  async function cancel() {
    await cancelTracked();
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
        {busy && task && (
          <Button type="button" size="sm" variant="outline" onClick={cancel}>
            <Ban className="h-4 w-4" /> Cancel
          </Button>
        )}
      </div>

      {busy && (
        <div className="mt-3 space-y-1">
          <Progress value={task?.progress ?? undefined} indeterminate={task?.progress == null} />
          <p className="text-[11px] text-muted-foreground">
            {task?.message ?? "Starting…"} — safe to navigate away, this keeps running and you can check back or watch it from the Task Center.
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
