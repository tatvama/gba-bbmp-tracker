import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Logs a BBMP work-search query (rule 19). Called inline inside
 *  searchBBMPWork so every search is logged regardless of entry point
 *  (search page, POST API route) — never a separate call the UI must
 *  remember to make. Best-effort: a logging failure never fails the search
 *  itself. */
export async function logSearchHistory(
  supabase: SupabaseClient,
  params: { userId: string | null; queryParams: Record<string, unknown>; resultCount: number },
): Promise<void> {
  const { error } = await supabase.from("search_history").insert({
    user_id: params.userId,
    query_params: params.queryParams,
    result_count: params.resultCount,
  });
  if (error) console.warn("[logSearchHistory]", error);
}
