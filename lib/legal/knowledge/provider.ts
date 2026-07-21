/**
 * Knowledge-base provider abstraction.
 *
 * The resolver depends on this interface, NOT on the concrete TypeScript catalog.
 * Today the only implementation is StaticKnowledgeBaseProvider (in-memory TS data).
 * A future JsonKnowledgeBaseProvider / DbKnowledgeBaseProvider / CMS-backed provider
 * can implement the same interface and be swapped in WITHOUT touching the resolver,
 * renderer, or drafting engine (see plan §10 / §13 migration strategy).
 */
import type { ComplaintType } from "@/lib/constants";
import type { LegalAuthority, LegalReference } from "@/lib/legal/types";

export interface KnowledgeBaseProvider {
  readonly version: string;
  /** Every ACTIVE reference (superseded entries excluded). */
  all(): LegalReference[];
  byCategory(category: ComplaintType): LegalReference[];
  byAuthority(authority: LegalAuthority): LegalReference[];
  byId(id: string): LegalReference | undefined;
}

/**
 * In-memory provider over a curated TypeScript catalog. Superseded entries (those
 * carrying `supersededBy`) are filtered out once, at construction, so no consumer
 * ever sees a repealed instrument. Lookups are O(1)/O(n) over a small array —
 * deterministic and allocation-light, honoring the "no extra latency" guarantee.
 */
export class StaticKnowledgeBaseProvider implements KnowledgeBaseProvider {
  readonly version: string;
  private readonly refs: LegalReference[];
  private readonly byIdMap: Map<string, LegalReference>;

  constructor(version: string, catalog: LegalReference[]) {
    this.version = version;
    // Exclude superseded law from the active set (e.g. BBMP Act 2020, SWM Rules 2016).
    this.refs = catalog.filter((r) => !r.supersededBy);
    this.byIdMap = new Map(this.refs.map((r) => [r.id, r]));
  }

  all(): LegalReference[] {
    return this.refs;
  }

  byCategory(category: ComplaintType): LegalReference[] {
    return this.refs.filter((r) => r.categories.includes(category));
  }

  byAuthority(authority: LegalAuthority): LegalReference[] {
    return this.refs.filter(
      (r) => r.authorities.includes(authority) || r.authorities.includes("Any"),
    );
  }

  byId(id: string): LegalReference | undefined {
    return this.byIdMap.get(id);
  }
}
