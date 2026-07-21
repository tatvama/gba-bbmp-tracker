/**
 * Versioned knowledge-base registry.
 *
 * Each version is an independent provider. `ACTIVE_KB_VERSION` selects the default;
 * a future v2 is added alongside v1 and the active pointer flipped WITHOUT touching
 * the resolver, renderer or drafting engine. `getKnowledgeBase(version?)` is the
 * single accessor the resolver uses.
 *
 * In non-production, the catalog is self-validated once at module load and any
 * defect is logged (never thrown) so a bad entry is caught in dev/test but can
 * never break live drafting.
 */
import type { KnowledgeBaseProvider } from "./provider";
import { StaticKnowledgeBaseProvider } from "./provider";
import { V1_CATALOG, V1_VERSION } from "./v1";
import { validateKnowledgeBase } from "@/lib/legal/validate";

export const ACTIVE_KB_VERSION = V1_VERSION;

const KB_VERSIONS: Record<string, KnowledgeBaseProvider> = {
  [V1_VERSION]: new StaticKnowledgeBaseProvider(V1_VERSION, V1_CATALOG),
};

if (process.env.NODE_ENV !== "production") {
  // `V1_CATALOG` includes intentionally-superseded entries (excluded by the
  // provider), so validate against the raw catalog to also verify those markers.
  const issues = validateKnowledgeBase(V1_CATALOG);
  if (issues.length) {
    console.warn(`[legal] knowledge base ${V1_VERSION} has ${issues.length} validation issue(s):\n  - ${issues.join("\n  - ")}`);
  }
}

export function getKnowledgeBase(version: string = ACTIVE_KB_VERSION): KnowledgeBaseProvider {
  const provider = KB_VERSIONS[version];
  if (!provider) throw new Error(`[legal] unknown knowledge-base version: ${version}`);
  return provider;
}
