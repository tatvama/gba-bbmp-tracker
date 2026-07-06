import "server-only";
import type { JobType } from "./types";

/**
 * Process-wide "how many jobs of this type are running right now" counter, so
 * e.g. 10 queued OCR jobs don't all hit the OCR provider simultaneously.
 * globalThis-cached like every other in-process singleton this codebase uses
 * (lib/import-queue/worker.ts's kickImportWorker, instrumentation.ts's
 * sweeper) so dev HMR / route-module duplication can't fork the counter.
 */

const KEY = "__gbaJobConcurrency__";

function state(): Map<JobType, number> {
  const g = globalThis as Record<string, unknown>;
  if (!(g[KEY] instanceof Map)) g[KEY] = new Map<JobType, number>();
  return g[KEY] as Map<JobType, number>;
}

/** Returns true and reserves a slot if under the limit; false if at capacity
 *  (caller leaves the job 'queued' — the retry/dead-job sweep or a future
 *  claim will pick it up once a slot frees). */
export function tryAcquire(type: JobType, limit: number): boolean {
  const s = state();
  const cur = s.get(type) ?? 0;
  if (cur >= limit) return false;
  s.set(type, cur + 1);
  return true;
}

export function release(type: JobType): void {
  const s = state();
  const cur = s.get(type) ?? 0;
  s.set(type, Math.max(0, cur - 1));
}
