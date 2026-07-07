"use client";

import * as React from "react";
import { listAllTasks, cancelJobAction, retryJobAction } from "@/lib/actions/jobs";
import type { TaskItem } from "@/lib/jobs/types";
import { matchesIdentity, type TaskIdentity } from "./task-identity";

export type { TaskFilter, TaskIdentity } from "./task-identity";
export { matchesIdentity } from "./task-identity";

/** A synthesized placeholder shown between `startTask(jobId, identity)` and
 *  the moment the registry's next poll/SSE tick confirms the real row — so a
 *  click still feels instant instead of waiting up to one sync cycle. Replaced
 *  the instant a real TaskItem with the same id shows up in `tasks`. */
function synthesizePendingTask(jobId: string, identity: TaskIdentity): TaskItem {
  return {
    id: jobId,
    source: "background_jobs",
    type: identity.taskType,
    module: identity.taskType,
    title: "Starting…",
    status: "queued",
    entityType: identity.entityType ?? null,
    entityId: identity.entityId ?? null,
    operation: identity.operation ?? null,
    subtype: identity.subtype ?? null,
    progress: null,
    stage: null,
    message: null,
    result: null,
    error: null,
    cancellable: false,
    resultLink: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    finishedAt: null,
  };
}

export interface TaskRegistryValue {
  /** The one shared, continuously-updated task list — every subscriber reads
   *  from this; nothing else in the app polls or opens its own SSE. */
  tasks: TaskItem[];
  refresh: () => void;
  registerPending: (jobId: string, identity: TaskIdentity) => void;
  cancel: (jobId: string) => Promise<void>;
  retry: (jobId: string) => Promise<void>;
}

const TaskRegistryContext = React.createContext<TaskRegistryValue | null>(null);

/**
 * The Central Task Registry — mounted once in app/layout.tsx. Per Next.js App
 * Router semantics a layout never remounts on route changes, so this provider
 * (and its one poll+SSE subscription) lives for the entire session regardless
 * of how the user navigates. Every feature that starts a background job
 * observes it through this registry (see lib/jobs/client/use-task.ts) instead
 * of opening its own polling loop.
 */
export function TaskRegistryProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = React.useState<TaskItem[]>([]);
  const [pending, setPending] = React.useState<Map<string, TaskIdentity>>(new Map());
  const activeRef = React.useRef(true);
  React.useEffect(() => () => { activeRef.current = false; }, []);

  const refresh = React.useCallback(() => {
    void listAllTasks()
      .then((next) => {
        if (!activeRef.current) return;
        setTasks(next);
        // A pending placeholder is only needed until the real row shows up.
        setPending((prev) => {
          if (prev.size === 0) return prev;
          const known = new Set(next.map((t) => t.id));
          let changed = false;
          const stillPending = new Map(prev);
          for (const id of prev.keys()) {
            if (known.has(id)) { stillPending.delete(id); changed = true; }
          }
          return changed ? stillPending : prev;
        });
      })
      .catch(() => { /* transient — the next poll tick (or SSE push) retries */ });
  }, []);

  React.useEffect(() => {
    refresh();
    const poll = setInterval(refresh, 5000);
    const es = new EventSource("/api/jobs/events");
    es.onmessage = () => refresh();
    return () => {
      clearInterval(poll);
      es.close();
    };
  }, [refresh]);

  const registerPending = React.useCallback((jobId: string, identity: TaskIdentity) => {
    setPending((prev) => {
      const next = new Map(prev);
      next.set(jobId, identity);
      return next;
    });
    refresh(); // don't wait for the next 5s tick / SSE push
  }, [refresh]);

  const cancel = React.useCallback(async (jobId: string) => {
    await cancelJobAction(jobId);
    refresh();
  }, [refresh]);

  const retry = React.useCallback(async (jobId: string) => {
    await retryJobAction(jobId);
    refresh();
  }, [refresh]);

  const mergedTasks = React.useMemo(() => {
    if (pending.size === 0) return tasks;
    const known = new Set(tasks.map((t) => t.id));
    const synthesized: TaskItem[] = [];
    for (const [jobId, identity] of pending) {
      if (!known.has(jobId)) synthesized.push(synthesizePendingTask(jobId, identity));
    }
    return synthesized.length ? [...synthesized, ...tasks] : tasks;
  }, [tasks, pending]);

  const value = React.useMemo<TaskRegistryValue>(
    () => ({ tasks: mergedTasks, refresh, registerPending, cancel, retry }),
    [mergedTasks, refresh, registerPending, cancel, retry],
  );

  return <TaskRegistryContext.Provider value={value}>{children}</TaskRegistryContext.Provider>;
}

export function useTaskRegistry(): TaskRegistryValue {
  const ctx = React.useContext(TaskRegistryContext);
  if (!ctx) throw new Error("useTaskRegistry() must be used within a TaskRegistryProvider (mounted once in app/layout.tsx).");
  return ctx;
}
