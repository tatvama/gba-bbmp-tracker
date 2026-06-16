import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SrRate } from "@/lib/forensics/rate-check";

/**
 * Load the full Schedule-of-Rates book, paginated to defeat the PostgREST
 * 1000-row default cap (a plain .limit(5000) silently returns ≤1000).
 */
export async function loadSrRates(client: SupabaseClient): Promise<SrRate[]> {
  const out: SrRate[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client
      .from("sr_rates")
      .select("sr_code, description, unit, rate, sr_year")
      .range(from, from + 999);
    if (error || !data || data.length === 0) break;
    for (const r of data) {
      out.push({
        srCode: (r.sr_code as string) ?? null,
        description: (r.description as string) ?? "",
        unit: (r.unit as string) ?? null,
        rate: Number(r.rate),
        srYear: (r.sr_year as string) ?? null,
      });
    }
    if (data.length < 1000) break;
  }
  return out;
}
