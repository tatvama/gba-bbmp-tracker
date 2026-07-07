"use client";

import * as React from "react";
import { useTaskRegistry } from "./task-registry";
import { matchesIdentity, type TaskIdentity, type TaskFilter } from "./task-identity";
import { ACTIVE_JOB_STATUSES, type TaskItem } from "@/lib/jobs/types";

/**
 * The standard developer API every module integrates with — see the Task
 * Registry plan. Starting the actual server-side work stays feature-specific
 * (each operation's own start-action knows its own inputs); everything past
 * that point — observing, resuming, cancelling, retrying — is this API,
 * identical for every module today and any registered in the future.
 *
 * Integration pattern:
 *   1. Call your feature's own start-action (already returns a jobId).
 *   2. task.startTask(jobId) — registers it for tracking, instantly.
 *   3. Render from task.task / task.isActive — resumes automatically on
 *      mount, including after navigation or a full refresh, because this
 *      hook never fetches on its own: it just filters the registry's
 *      already-loaded, continuously-updated list.
 */
export function useTask(identity: TaskIdentity): {
  task: TaskItem | null;
  isActive: boolean;
  startTask: (jobId: string) => void;
  cancel: () => Promise<void>;
  retry: () => Promise<void>;
} {
  const registry = useTaskRegistry();
  const task = React.useMemo(
    () => registry.tasks.find((t) => matchesIdentity(t, identity)) ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [registry.tasks, identity.taskType, identity.entityType, identity.entityId, identity.operation, identity.subtype],
  );
  const isActive = task ? ACTIVE_JOB_STATUSES.has(task.status) : false;

  const startTask = React.useCallback(
    (jobId: string) => registry.registerPending(jobId, identity),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [registry, identity.taskType, identity.entityType, identity.entityId, identity.operation, identity.subtype],
  );
  const cancel = React.useCallback(async () => {
    if (task) await registry.cancel(task.id);
  }, [registry, task]);
  const retry = React.useCallback(async () => {
    if (task) await registry.retry(task.id);
  }, [registry, task]);

  return { task, isActive, startTask, cancel, retry };
}

/** List-shaped subscription — every task matching `filter` (a partial
 *  identity; an omitted field, including taskType, matches anything),
 *  live-updating from the same shared registry. For consumers that show many
 *  tasks at once (the Global Task Center, a document list with several OCR
 *  jobs in flight) rather than tracking one specific task. */
export function useTasks(filter?: TaskFilter): TaskItem[] {
  const registry = useTaskRegistry();
  return React.useMemo(() => {
    if (!filter) return registry.tasks;
    return registry.tasks.filter((t) => matchesIdentity(t, filter));
  }, [registry.tasks, filter]);
}

/** Synchronous snapshot — no subscription, no re-render on change. For a
 *  one-time "is one already running?" check before deciding whether to even
 *  show a start button, outside of render (e.g. in an event handler). */
export function useTaskSnapshot(): { getTask: (identity: TaskFilter) => TaskItem | null; getTasks: (filter?: TaskFilter) => TaskItem[] } {
  const registry = useTaskRegistry();
  const getTask = React.useCallback(
    (identity: TaskFilter) => registry.tasks.find((t) => matchesIdentity(t, identity)) ?? null,
    [registry.tasks],
  );
  const getTasks = React.useCallback(
    (filter?: TaskFilter) => (filter ? registry.tasks.filter((t) => matchesIdentity(t, filter)) : registry.tasks),
    [registry.tasks],
  );
  return { getTask, getTasks };
}

/** Start/cancel/retry any job by id, independent of a specific useTask()
 *  call — list-shaped consumers (the Global Task Center's per-row buttons, a
 *  table that starts a different entity's job per row) need this shape:
 *  they manage many tasks at once, not one fixed tracked identity. */
export function useTaskActions(): {
  startTask: (jobId: string, identity: TaskIdentity) => void;
  cancel: (jobId: string) => Promise<void>;
  retry: (jobId: string) => Promise<void>;
  refresh: () => void;
} {
  const registry = useTaskRegistry();
  return { startTask: registry.registerPending, cancel: registry.cancel, retry: registry.retry, refresh: registry.refresh };
}
