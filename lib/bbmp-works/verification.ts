import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkVerificationStatus } from "./types";
import { normalizeAmount, normalizeDate, normalizePhoneNumber } from "./normalize";

/**
 * Verified: 2+ official sources agree. Partially Verified: exactly 1 official
 * source. Unverified: 0 sources. Conflicting Information: two sources
 * disagree on the same (normalized) field value — checked first, since a
 * work with sources that actively contradict each other shouldn't read as
 * merely "Verified" just because there happen to be 2+ of them.
 */
export function getVerificationStatus(
  officialSourceCount: number,
  conflictingData: boolean,
): WorkVerificationStatus {
  if (conflictingData) return "Conflicting Information";
  if (officialSourceCount >= 2) return "Verified";
  if (officialSourceCount === 1) return "Partially Verified";
  return "Unverified";
}

const AMOUNT_FIELDS = new Set([
  "estimateAmount", "sanctionedAmount", "tenderAmount", "paidAmount",
]);
const DATE_FIELDS = new Set([
  "tenderDate", "workOrderDate", "startDate", "expectedCompletionDate", "actualCompletionDate",
]);
const PHONE_FIELDS = new Set(["engineerPhone", "contractorPhone"]);

/** Normalize one field's raw value the same way regardless of which source
 *  reported it, so "₹29,89,000" and "2989000" compare equal instead of
 *  registering as a false conflict. */
function normalizeForCompare(field: string, rawValue: unknown): string | null {
  if (rawValue == null || rawValue === "") return null;
  if (AMOUNT_FIELDS.has(field)) {
    const n = normalizeAmount(rawValue as string | number);
    return n == null ? null : String(n);
  }
  if (DATE_FIELDS.has(field)) return normalizeDate(String(rawValue));
  if (PHONE_FIELDS.has(field)) return normalizePhoneNumber(String(rawValue));
  return String(rawValue).trim().toLowerCase() || null;
}

/** True if two or more sources report different normalized values for the
 *  same field on the same work. */
export function detectConflicts(
  sources: Array<{ fieldSnapshot: Record<string, unknown> | null }>,
): boolean {
  const seen = new Map<string, string>();
  for (const s of sources) {
    for (const [field, rawValue] of Object.entries(s.fieldSnapshot ?? {})) {
      const normalized = normalizeForCompare(field, rawValue);
      if (normalized == null) continue;
      const prior = seen.get(field);
      if (prior !== undefined && prior !== normalized) return true;
      seen.set(field, normalized);
    }
  }
  return false;
}

/** Recompute + persist official_source_count/verification_status for one
 *  work from its current work_sources rows. Call after every work_sources
 *  insert (source adapters, manual-entry form). */
export async function recomputeVerification(supabase: SupabaseClient, workId: string): Promise<void> {
  const { data: sources, error } = await supabase
    .from("work_sources")
    .select("is_official, field_snapshot")
    .eq("work_id", workId);
  if (error) {
    console.error("[recomputeVerification]", error);
    return;
  }
  const rows = sources ?? [];
  const officialSourceCount = rows.filter((s) => s.is_official).length;
  const conflicting = detectConflicts(rows.map((s) => ({ fieldSnapshot: s.field_snapshot as Record<string, unknown> | null })));
  const verificationStatus = getVerificationStatus(officialSourceCount, conflicting);
  const { error: updateError } = await supabase
    .from("bbmp_works")
    .update({ official_source_count: officialSourceCount, verification_status: verificationStatus })
    .eq("id", workId);
  if (updateError) console.error("[recomputeVerification:update]", updateError);
}
