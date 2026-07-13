import type { SourceId, WorkSourceAdapter } from "./types";

/**
 * The ONE place a source adapter plugs in — mirrors lib/jobs/registry.ts's
 * shape deliberately, so this file never needs to import feature code; each
 * adapter file (./adapters/*.ts) calls registerSourceAdapter at module load,
 * and lib/sources/adapters/index.ts side-effect-imports every adapter file.
 */

const adapters: Partial<Record<SourceId, WorkSourceAdapter>> = {};

export function registerSourceAdapter(adapter: WorkSourceAdapter): void {
  adapters[adapter.id] = adapter;
}

export function getSourceAdapter(id: SourceId): WorkSourceAdapter | undefined {
  return adapters[id];
}

export function allSourceAdapters(): WorkSourceAdapter[] {
  return Object.values(adapters).filter((a): a is WorkSourceAdapter => !!a);
}
