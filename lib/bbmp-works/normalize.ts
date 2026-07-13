/**
 * Data normalization for the BBMP work-search feature. Amount/job-number
 * parsing is deliberately re-exported from lib/ifms/downloader.ts rather than
 * reimplemented — that module already solves both problems (tested against
 * real production data) and is the single canonical implementation.
 */
import { extractJobCode, parseAmount } from "@/lib/ifms/downloader";

export { parseAmount as normalizeAmount };

/** Spec-literal cleanup for a user-typed job/work-number search field, then
 *  canonicalize via extractJobCode (handles Unicode dash variants). Falls back
 *  to the cleaned literal when the value doesn't look like a ddd-yy-nnnnnn code
 *  (e.g. a free-form work number). */
export function normalizeJobNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim().toUpperCase().replace(/\s+/g, "").replace(/_/g, "-");
  if (!cleaned) return null;
  return extractJobCode(cleaned) ?? cleaned;
}

export function normalizePhoneNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
