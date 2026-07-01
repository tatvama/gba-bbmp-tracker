"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { listMyActiveJobs, type BackgroundJob } from "@/lib/actions/jobs";

/**
 * Global "running jobs" chip (top bar, every page). Polls the current user's
 * active background jobs so AI generation / imports keep visibly running even
 * after navigating away; hidden when nothing is running.
 */
export function JobsIndicator() {
  const [jobs, setJobs] = React.useState<BackgroundJob[]>([]);

  const load = React.useCallback(async () => {
    try {
      setJobs(await listMyActiveJobs());
    } catch { /* transient */ }
  }, []);

  React.useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5_000);
    return () => clearInterval(t);
  }, [load]);

  if (jobs.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-8 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
          aria-label={`${jobs.length} background job(s) running`}
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>{jobs.length} running</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-0">
        <div className="border-b px-3 py-2 text-sm font-semibold">Running in background</div>
        <ul className="max-h-80 overflow-auto">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center gap-2 px-3 py-2.5 text-xs">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
              <span className="truncate">{j.title ?? j.type}</span>
            </li>
          ))}
        </ul>
        <p className="border-t px-3 py-2 text-[10px] text-muted-foreground">You&apos;ll get an alert when each finishes — safe to navigate away.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
