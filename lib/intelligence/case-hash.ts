/**
 * Cache key for a case's intelligence artifact, over only the fields that could
 * change the analysis (status, dates, and counts/last-ids of every related
 * record set) plus the engine + prompt versions. A no-op cosmetic edit does not
 * bust the cache; adding a document / reply / audit, or bumping a version, does.
 * A cache key only needs a low collision rate, not cryptographic strength, so
 * this deliberately avoids Node's `crypto` module (no "server-only", no native/
 * Node-builtin import at all): this module is reachable from the background
 * escalation sweeper started in instrumentation.ts, which Next.js also compiles
 * for the edge runtime — where `crypto` (and any native binding) fails to
 * resolve at build time, regardless of the runtime guard in instrumentation.ts's
 * own register() function. lib/ai/advisor/context-hash.ts uses `crypto` and
 * works fine ONLY because nothing reachable from instrumentation.ts imports it.
 */
export function fnv1a64Hex(input: string): string {
  // FNV-1a, 64-bit via BigInt — pure JS, no dependency, good distribution for a
  // cache key over a small JSON signal object.
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}
export interface CaseHashSignal {
  engineVersion: string;
  promptVersions: Record<string, string>;
  status?: string | null;
  jobNumber?: string | null;
  latestReplyDate?: string | null;
  latestActionTakenDate?: string | null;
  complaintDocs: { count: number; lastId: string | null };
  jobDocs: { count: number; lastId: string | null };
  jobAuditId: string | null;
  jobAuditAt: string | null;
  billAudits: number;
  replies: { count: number; lastId: string | null };
  actions: { count: number; lastId: string | null };
  escalations: { count: number; lastId: string | null };
  timeline: { count: number; lastId: string | null };
}

export function computeCaseContextHash(signal: CaseHashSignal): string {
  return fnv1a64Hex(JSON.stringify(signal));
}

export function lastId<T extends { id: string }>(rows: T[]): string | null {
  return rows.length ? rows[rows.length - 1]!.id : null;
}
