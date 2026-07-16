import type { Evidence } from "./types";

/**
 * Shared, mutable evidence/id store threaded through the engine stages so every
 * observation/entity can mint a stable evidence id and reference it. Keeping id
 * allocation in one place guarantees graph edges resolve.
 */
export function createStore() {
  const evidence: Evidence[] = [];
  let ev = 0, obs = 0, off = 0, tl = 0;
  return {
    evidence,
    addEvidence(e: Omit<Evidence, "id">): string {
      const id = `ev_${++ev}`;
      evidence.push({ id, ...e, extract: (e.extract || "").slice(0, 600) });
      return id;
    },
    obsId(): string { return `obs_${++obs}`; },
    offId(): string { return `off_${++off}`; },
    tlId(): string { return `tl_${++tl}`; },
  };
}
export type Store = ReturnType<typeof createStore>;
