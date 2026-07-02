import "server-only";
import { EventEmitter } from "node:events";

/**
 * In-process pub/sub for live import progress. The worker publishes after
 * every DB progress write; each open SSE connection subscribes for its user.
 * Cached on globalThis so dev-mode HMR / route-module duplication never forks
 * the emitter (worker and SSE route must share ONE instance). DB state remains
 * the source of truth — the SSE route also polls as a fallback, so a missed
 * event only delays an update, never loses it.
 */

const KEY = "__gbaImportBus__";

function bus(): EventEmitter {
  const g = globalThis as Record<string, unknown>;
  if (!(g[KEY] instanceof EventEmitter)) {
    const e = new EventEmitter();
    e.setMaxListeners(100); // many parallel SSE connections are fine
    g[KEY] = e;
  }
  return g[KEY] as EventEmitter;
}

/** Nudge every SSE stream owned by `userId` to re-send its snapshot. */
export function publishImportChange(userId: string): void {
  bus().emit(`import:${userId}`);
}

export function subscribeImportChanges(userId: string, cb: () => void): () => void {
  const e = bus();
  e.on(`import:${userId}`, cb);
  return () => e.off(`import:${userId}`, cb);
}
