"use client";

import * as React from "react";
import { Loader2, Eye, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { scanDivisionVisualDuplicatesAction } from "@/lib/actions/job-photo-dedupe";
import type { VisualScanResult } from "@/lib/forensic/job-photo-dedupe";

/**
 * On-demand VISUAL duplicate scan (the print→scan case hashes miss). Pick a
 * division and let the vision model compare photos across different job codes.
 */
export function VisualDupScan({ divisions }: { divisions: string[] }) {
  const [division, setDivision] = React.useState(divisions[0] ?? "");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<VisualScanResult | null>(null);

  async function run() {
    if (!division) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(await scanDivisionVisualDuplicatesAction(division));
    } catch (e) {
      setResult({ ok: false, comparisons: 0, cached: 0, matches: [], capped: false, error: e instanceof Error ? e.message : "Failed" });
    } finally {
      setBusy(false);
    }
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
      </div>

      {result && (
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
                    {m.sharedDetails && <p className="mt-1 text-xs text-muted-foreground">{m.sharedDetails}</p>}
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
