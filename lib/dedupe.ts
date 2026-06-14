/**
 * Duplicate-contact detection by normalised phone / email / name.
 * Pure module — shared by the directory UI, import service, and tests.
 */
import { normalizePhone } from "./phone";

const HONORIFICS = /\b(sri|shri|smt|smt\.|mr|mr\.|mrs|mrs\.|ms|ms\.|dr|dr\.)\b/gi;

export function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

export function normalizeName(raw: string | null | undefined): string {
  return (raw ?? "")
    .toLowerCase()
    .replace(HONORIFICS, " ")
    .replace(/[^a-z0-9ಀ-೿ ]/g, " ") // keep latin + Kannada block
    .replace(/\s+/g, " ")
    .trim();
}

export interface DedupeKeyed {
  id?: string;
  fullName?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
}

export interface DuplicateMatch<T> {
  a: T;
  b: T;
  reason: "phone" | "email" | "name";
}

/** True if two contacts collide on any normalised key. */
export function isDuplicatePair(x: DedupeKeyed, y: DedupeKeyed): DuplicateMatch<DedupeKeyed>["reason"] | null {
  const px = new Set([normalizePhone(x.phone), normalizePhone(x.whatsapp)].filter(Boolean));
  const py = new Set([normalizePhone(y.phone), normalizePhone(y.whatsapp)].filter(Boolean));
  for (const p of px) if (py.has(p)) return "phone";

  const ex = normalizeEmail(x.email);
  const ey = normalizeEmail(y.email);
  if (ex && ex === ey) return "email";

  const nx = normalizeName(x.fullName);
  const ny = normalizeName(y.fullName);
  if (nx && nx === ny) return "name";

  return null;
}

/** Find all duplicate pairs within a list (O(n²); fine for civic-scale data). */
export function findDuplicates<T extends DedupeKeyed>(items: T[]): DuplicateMatch<T>[] {
  const out: DuplicateMatch<T>[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (!a || !b) continue;
      const reason = isDuplicatePair(a, b);
      if (reason) out.push({ a, b, reason });
    }
  }
  return out;
}
