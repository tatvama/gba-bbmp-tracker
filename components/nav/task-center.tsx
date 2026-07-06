"use client";

import * as React from "react";
import Link from "next/link";
import {
  Loader2, ListChecks, Clock, RotateCcw, Ban,
  ExternalLink, Copy, ChevronDown, ChevronRight, Search, LayoutGrid, List,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useJobPoll } from "@/lib/hooks/use-job-poll";
import { listAllTasks, retryJobAction, cancelJobAction } from "@/lib/actions/jobs";
import type { TaskItem } from "@/lib/jobs/types";
import { cn } from "@/lib/utils";

const ACTIVE_STATUSES = new Set(["queued", "running", "retrying"]);

const STATUS_BADGE: Record<string, BadgeProps["variant"]> = {
  queued: "muted",
  running: "info",
  retrying: "warning",
  done: "success",
  failed: "destructive",
  cancelled: "muted",
};

const STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  retrying: "Retrying",
  done: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

function elapsedLabel(startedAt: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function estimateRemaining(task: TaskItem): string | null {
  if (task.progress == null || task.progress <= 0 || task.progress >= 100) return null;
  const elapsedMs = Date.now() - new Date(task.createdAt).getTime();
  const remainingMs = (elapsedMs / task.progress) * (100 - task.progress);
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return null;
  const s = Math.round(remainingMs / 1000);
  return s < 60 ? `~${s}s left` : `~${Math.round(s / 60)}m left`;
}

/**
 * The Global Task Center — every background job AND every read-only-adapted
 * task (ZIP import, ack reconciliation — see lib/jobs/adapters.ts) the
 * current user has in flight or recently finished, visible from any page.
 * Replaces the old jobs-indicator.tsx chip (same trigger visual, now opens a
 * real panel instead of a read-only dropdown). Polls listAllTasks() every 5s
 * as the reliability floor; an EventSource against /api/jobs/events nudges an
 * immediate refresh so updates usually show up within ~150ms of a runner
 * write instead of waiting for the next poll tick.
 */
export function TaskCenter() {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string | null>(null);
  const [newestFirst, setNewestFirst] = React.useState(true);
  const [groupByModule, setGroupByModule] = React.useState(false);
  const [collapseCompleted, setCollapseCompleted] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [logsFor, setLogsFor] = React.useState<TaskItem | null>(null);
  const [, forceTick] = React.useState(0); // re-renders elapsed/ETA labels every few seconds

  const fetcher = React.useCallback(() => listAllTasks(), []);
  const { data: tasks, refresh } = useJobPoll<TaskItem[]>(fetcher, 5000);
  const list = tasks ?? [];

  React.useEffect(() => {
    if (!open) return;
    const es = new EventSource("/api/jobs/events");
    // The SSE payload already carries the full task list, but re-using the
    // same server action as the poll fallback keeps ONE code path for "how do
    // we get the list" rather than two slightly-different shapes — a
    // deliberate simplicity-over-micro-optimization tradeoff at this app's
    // scale (a handful of tasks per user, not a high-throughput queue).
    es.onmessage = () => refresh();
    return () => es.close();
  }, [open, refresh]);

  React.useEffect(() => {
    if (!open) return;
    const t = setInterval(() => forceTick((n) => n + 1), 3000);
    return () => clearInterval(t);
  }, [open]);

  const activeCount = list.filter((t) => ACTIVE_STATUSES.has(t.status)).length;

  async function doRetry(task: TaskItem) {
    setBusyId(task.id);
    await retryJobAction(task.id);
    refresh();
    setBusyId(null);
  }
  async function doCancel(task: TaskItem) {
    setBusyId(task.id);
    await cancelJobAction(task.id);
    refresh();
    setBusyId(null);
  }
  function copyError(task: TaskItem) {
    if (task.error) void navigator.clipboard.writeText(task.error);
  }

  const q = search.trim().toLowerCase();
  const filtered = list
    .filter((t) => !statusFilter || t.status === statusFilter)
    .filter((t) => !q || t.title.toLowerCase().includes(q) || t.module.toLowerCase().includes(q))
    .sort((a, b) => (newestFirst ? 1 : -1) * (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));

  const active = filtered.filter((t) => ACTIVE_STATUSES.has(t.status));
  const completed = filtered.filter((t) => t.status === "done");
  const failed = filtered.filter((t) => t.status === "failed" || t.status === "cancelled");

  const groups = groupByModule
    ? Array.from(new Set(filtered.map((t) => t.module))).map((label) => ({
        label,
        tasks: filtered.filter((t) => t.module === label),
      }))
    : null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
          activeCount > 0 ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10" : "border-border/60 text-muted-foreground hover:bg-muted/60",
        )}
        aria-label="Open Task Center"
      >
        {activeCount > 0 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListChecks className="h-3.5 w-3.5" />}
        <span>{activeCount > 0 ? `${activeCount} running` : "Tasks"}</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full max-w-md flex-col gap-0 p-0 sm:max-w-md">
          <SheetTitle className="border-b px-4 py-3.5 text-sm font-semibold">Task Center</SheetTitle>

          <div className="flex flex-col gap-2 border-b px-4 py-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks…" className="h-8 pl-8 text-xs" />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(["queued", "running", "retrying", "done", "failed", "cancelled"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter((cur) => (cur === s ? null : s))}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors",
                    statusFilter === s ? "border-primary bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:bg-muted/60",
                  )}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <div className="flex items-center gap-3">
                <button onClick={() => setNewestFirst((v) => !v)} className="flex items-center gap-1 hover:text-foreground">
                  <Clock className="h-3 w-3" /> {newestFirst ? "Newest first" : "Oldest first"}
                </button>
                <button onClick={() => setGroupByModule((v) => !v)} className="flex items-center gap-1 hover:text-foreground">
                  {groupByModule ? <List className="h-3 w-3" /> : <LayoutGrid className="h-3 w-3" />} {groupByModule ? "Grouped" : "Flat"}
                </button>
              </div>
              <button onClick={() => setCollapseCompleted((v) => !v)} className="flex items-center gap-1 hover:text-foreground">
                {collapseCompleted ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} Completed
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">Nothing here yet — background tasks you start will show up in this panel from any page.</p>
            ) : groups ? (
              <div className="space-y-4">
                {groups.map((g) => (
                  <div key={g.label} className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{g.label}</p>
                    <div className="space-y-2">
                      {g.tasks.map((t) => (
                        <TaskRow key={t.id} task={t} busy={busyId === t.id} onRetry={doRetry} onCancel={doCancel} onCopyError={copyError} onViewLogs={setLogsFor} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {active.length > 0 && (
                  <Section title="Running & Queued" count={active.length}>
                    {active.map((t) => (
                      <TaskRow key={t.id} task={t} busy={busyId === t.id} onRetry={doRetry} onCancel={doCancel} onCopyError={copyError} onViewLogs={setLogsFor} />
                    ))}
                  </Section>
                )}
                {failed.length > 0 && (
                  <Section title="Failed & Cancelled" count={failed.length}>
                    {failed.map((t) => (
                      <TaskRow key={t.id} task={t} busy={busyId === t.id} onRetry={doRetry} onCancel={doCancel} onCopyError={copyError} onViewLogs={setLogsFor} />
                    ))}
                  </Section>
                )}
                {completed.length > 0 && !collapseCompleted && (
                  <Section title="Completed" count={completed.length}>
                    {completed.map((t) => (
                      <TaskRow key={t.id} task={t} busy={busyId === t.id} onRetry={doRetry} onCancel={doCancel} onCopyError={copyError} onViewLogs={setLogsFor} />
                    ))}
                  </Section>
                )}
                {completed.length > 0 && collapseCompleted && (
                  <button onClick={() => setCollapseCompleted(false)} className="w-full rounded-lg border border-dashed py-2 text-[11px] font-medium text-muted-foreground hover:bg-muted/40">
                    {completed.length} completed task{completed.length === 1 ? "" : "s"} — click to show
                  </button>
                )}
              </div>
            )}
          </div>

          <p className="border-t px-4 py-2 text-[10px] text-muted-foreground">Safe to navigate away — tasks keep running and you&apos;ll get a notification when each finishes.</p>
        </SheetContent>
      </Sheet>

      {logsFor && (
        <Sheet open onOpenChange={(v) => !v && setLogsFor(null)}>
          <SheetContent side="right" className="w-full max-w-lg">
            <SheetTitle className="mb-2">{logsFor.title}</SheetTitle>
            <pre className="max-h-[70vh] overflow-auto rounded-md bg-muted/40 p-3 text-[11px] whitespace-pre-wrap">
              {JSON.stringify({ stage: logsFor.stage, message: logsFor.message, error: logsFor.error }, null, 2)}
            </pre>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
        <Badge variant="muted" className="text-[9px]">{count}</Badge>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function TaskRow({
  task,
  busy,
  onRetry,
  onCancel,
  onCopyError,
  onViewLogs,
}: {
  task: TaskItem;
  busy: boolean;
  onRetry: (t: TaskItem) => void;
  onCancel: (t: TaskItem) => void;
  onCopyError: (t: TaskItem) => void;
  onViewLogs: (t: TaskItem) => void;
}) {
  const link = task.status === "done" ? task.resultLink : null;
  const isActive = ACTIVE_STATUSES.has(task.status);
  const eta = isActive ? estimateRemaining(task) : null;
  // Retry only makes sense for real framework jobs — adapter-sourced items
  // (ZIP import, ack reconciliation) have their own review/retry surface on
  // their own pages; retryJobAction only ever touches background_jobs rows.
  const canRetry = task.source === "background_jobs" && task.status === "failed";

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-foreground">{task.title}</p>
          <p className="text-[10px] text-muted-foreground">{task.module}</p>
        </div>
        <Badge variant={STATUS_BADGE[task.status] ?? "muted"} className="text-[9px] shrink-0">
          {STATUS_LABEL[task.status] ?? task.status}
        </Badge>
      </div>

      {isActive && (
        <div className="space-y-1">
          <Progress value={task.progress ?? undefined} indeterminate={task.progress == null} />
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="truncate">{task.stage ?? STATUS_LABEL[task.status]}</span>
            <span className="shrink-0">
              {elapsedLabel(task.createdAt)}
              {eta ? ` · ${eta}` : ""}
            </span>
          </div>
          {task.message && <p className="truncate text-[10px] text-muted-foreground">{task.message}</p>}
        </div>
      )}

      {task.status === "failed" && task.error && <p className="truncate text-[10px] text-rose-600 dark:text-rose-400">{task.error}</p>}

      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        {canRetry && (
          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={busy} onClick={() => onRetry(task)}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Retry
          </Button>
        )}
        {task.cancellable && (
          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={busy} onClick={() => onCancel(task)}>
            <Ban className="h-3 w-3" /> Cancel
          </Button>
        )}
        {link && (
          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" asChild>
            <Link href={link}>
              <ExternalLink className="h-3 w-3" /> Open result
            </Link>
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => onViewLogs(task)}>
          View logs
        </Button>
        {task.error && (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => onCopyError(task)}>
            <Copy className="h-3 w-3" /> Copy error
          </Button>
        )}
      </div>
    </div>
  );
}
