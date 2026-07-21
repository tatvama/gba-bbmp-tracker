/**
 * Legal Framework Engine — shared types.
 *
 * An ADDITIVE layer that resolves the applicable legal framework for a complaint
 * from a curated, VERIFIED knowledge base and hands the drafting engine a ranked,
 * deduplicated, reasoning-backed set of citations plus reusable drafting templates.
 *
 * Pure data / logic only: no `server-only`, no next/headers, no Supabase — so the
 * whole layer is unit-testable and importable from any context. The complaint DB
 * row is mapped to the resolver's DTO by lib/legal/context.ts (the single point
 * coupled to the DB schema).
 */
import type { ComplaintType, ComplaintDraftKind } from "@/lib/constants";

/** Relevance weight of a reference to a given complaint. High = always cite,
 *  Medium = cite only if the facts support it, Low = excluded unless a specific
 *  fact/keyword supports it. */
export type LegalPriority = "High" | "Medium" | "Low";

/** Citation-accuracy confidence. A section number is only ever attached when its
 *  provision confidence is "High". A "Low"-confidence provision is never cited. */
export type LegalConfidence = "High" | "Medium" | "Low";

export type InstrumentKind = "Act" | "Rules" | "Bye-law" | "Regulation" | "Sanhita" | "Order";

/** Authorities a statute governs / that may receive a letter. The same complaint
 *  can produce different references depending on who the letter is addressed to.
 *  "Any" = universally applicable regardless of recipient. */
export type LegalAuthority =
  | "BBMP"
  | "GBA"
  | "BWSSB"
  | "BESCOM"
  | "BDA"
  | "Traffic Police"
  | "Forest Department"
  | "Revenue Department"
  | "KSPCB"
  | "Lokayukta"
  | "Police"
  | "Chief Secretary"
  | "CM Office"
  | "Any";

/** A single citable provision inside an instrument (section / rule / bye-law).
 *  Confidence is PER-PROVISION: an Act can be rock-solid while a specific section
 *  number is uncertain — in which case the section is omitted and the Act is still
 *  cited by name. */
export interface LegalProvision {
  /** e.g. "Section 266" | "Rule 15" | "Bye-law 3". Omit for a whole-Act reference. */
  ref?: string;
  confidence: LegalConfidence;
  /** Plain-language duty / power. NEVER verbatim statutory text. */
  obligation: string;
  /** Reusable professional drafting sentence the engine may lean on for phrasing. */
  template: string;
  /**
   * Optional provision-level scoping. When set, this provision is only surfaced
   * for a complaint that matches (else it applies whenever its parent reference is
   * selected). Lets one instrument (e.g. the KMC Act) carry many sections while a
   * given letter only shows the sections relevant to its facts.
   */
  categories?: ComplaintType[];
  keywords?: string[];
}

/** Instrument-level catalog entry. */
export interface LegalReference {
  /** Stable slug, e.g. "kmc-1976". Unique across the active knowledge base. */
  id: string;
  instrument: string;
  year: number;
  kind: InstrumentKind;
  /** Authorities this instrument governs. "Any" bypasses the authority gate. */
  authorities: LegalAuthority[];
  /** Complaint departments this instrument is a core reference for. */
  categories: ComplaintType[];
  /** Trigger words matched (case-insensitively) against the resolution haystack. */
  keywords: string[];
  /** Base relevance weight before per-complaint boosting. */
  priority: LegalPriority;
  /** Instrument-level (name + year) confidence — "High" for every shipped v1 entry. */
  confidence: LegalConfidence;
  /** At least one; a whole-Act entry has a single provision with no `ref`. */
  provisions: LegalProvision[];
  /** WHY this is relevant — EXPLAINABILITY. Internal only; never rendered. */
  reason: string;
  /** Human note on when to cite. Internal only. */
  conditions?: string;
  /** When set, the entry is EXCLUDED from the active knowledge base (superseded law). */
  supersededBy?: string;
  /** Provenance (authoritative source) for audit / review. Internal only. */
  source?: string;
}

/**
 * DTO the resolver consumes. Built by lib/legal/context.ts from the complaint row
 * + draft options, so the resolver stays decoupled from the DB schema. Adding a
 * new resolution factor later means editing the adapter, not the resolver.
 */
export interface LegalResolutionContext {
  type: ComplaintType;
  subtype?: string | null;
  /** AI-classified category — `c.type` is itself the classifier output; a finer
   *  free-text classification can flow in here without touching the resolver. */
  classifiedCategory?: string | null;
  title?: string | null;
  description?: string | null;
  requestedAction?: string | null;
  responsibleDepartment?: string | null;
  receivingAuthority: LegalAuthority;
  draftKind: ComplaintDraftKind;
  /** Evidence signal (linked forensic job audit / case-intelligence findings). */
  hasForensicFindings: boolean;
  location?: string | null;
  caseHistoryText?: string | null;
}

/** A reference the resolver kept for a specific complaint. */
export interface ResolvedReference {
  reference: LegalReference;
  /** High/Medium-confidence provisions retained for this draft (Low dropped). */
  provisions: LegalProvision[];
  effectivePriority: LegalPriority;
  /** e.g. ["category:Health", "keyword:garbage", "authority:BBMP"]. */
  matchedFactors: string[];
}

/** Internal explainability record — logged for audit, never rendered into a letter. */
export interface ResolutionTraceEntry {
  id: string;
  decision: "included" | "dropped";
  reasonInternal: string;
  effectivePriority?: LegalPriority;
  score?: number;
}

export interface ResolvedLegalFramework {
  /** Knowledge-base version used — makes a draft's legal basis reproducible. */
  version: string;
  /** Ranked, deduped, capped. */
  references: ResolvedReference[];
  /** Why each reference was kept or dropped. Internal only. */
  trace: ResolutionTraceEntry[];
  /** Count dropped by the relevance cap — logged, never silently swallowed. */
  truncated?: number;
}
