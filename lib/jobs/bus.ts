import "server-only";
import { EventEmitter } from "node:events";

/**
 * In-process pub/sub for live job progress — the same proven pattern as
 * lib/import-queue/bus.ts, generalized to every job type instead of just ZIP
 * imports. The runner publishes after every DB progress write; each open SSE
 * connection (app/api/jobs/events/route.ts) subscribes for its user. Cached
 * on globalThis so dev-mode HMR / route-module duplication never forks the
 * emitter. DB state remains the source of truth — the SSE route also polls
 * as a fallback, so a missed event only delays an update, never loses it.
 */

const KEY = "__gbaJobBus__";

function bus(): EventEmitter {
  const g = globalThis as Record<string, unknown>;
  if (!(g[KEY] instanceof EventEmitter)) {
    const e = new EventEmitter();
    e.setMaxListeners(200);
    g[KEY] = e;
  }
  return g[KEY] as EventEmitter;
}

/** Nudge every SSE stream owned by `userId` to re-send its snapshot. */
export function publishJobChange(userId: string): void {
  bus().emit(`job:${userId}`);
}

export function subscribeJobChanges(userId: string, cb: () => void): () => void {
  const e = bus();
  e.on(`job:${userId}`, cb);
  return () => e.off(`job:${userId}`, cb);
}
