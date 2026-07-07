import type { JobType, TaskItem } from "@/lib/jobs/types";

/**
 * A task's stable identity — never a display string. `operation`/`subtype`
 * come from lib/jobs/adapters.ts's read-side projection of the job's own
 * `input` (see deriveOperationSubtype there), not from anything client-side.
 *
 * Two shapes: `TaskFilter` (every field optional, including taskType — "any
 * task of any kind matching what I specified") is for list-shaped consumers;
 * `TaskIdentity` narrows it to require `taskType`, since tracking one
 * specific task without knowing what kind of task it is doesn't make sense.
 *
 * Deliberately no React/Next.js import here — this is pure matching logic,
 * shared by the client Task Registry and directly unit-tested on its own.
 */
export interface TaskFilter {
  taskType?: JobType;
  entityType?: string | null;
  entityId?: string | null;
  operation?: string | null;
  subtype?: string | null;
}
export type TaskIdentity = TaskFilter & { taskType: JobType };

/** True when every field specified on `filter` matches `task` (an unspecified
 *  field is a wildcard). */
export function matchesIdentity(task: TaskItem, filter: TaskFilter): boolean {
  if (filter.taskType !== undefined && task.type !== filter.taskType) return false;
  if (filter.entityType !== undefined && task.entityType !== filter.entityType) return false;
  if (filter.entityId !== undefined && task.entityId !== filter.entityId) return false;
  if (filter.operation !== undefined && task.operation !== filter.operation) return false;
  if (filter.subtype !== undefined && task.subtype !== filter.subtype) return false;
  return true;
}
