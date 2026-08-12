import "server-only";
import { createClient } from "@/lib/db";

/**
 * Self-contained query helpers for this feature (kept separate from
 * lib/queries.ts, which is out of scope for this task).
 */

export interface SearchHistoryRow {
  id: string;
  query_params: Record<string, unknown>;
  result_count: number;
  searched_at: string;
}

function logErr(where: string, error: unknown) {
  if (error) console.warn(`[bbmp-works:queries:${where}]`, error);
}

/**
 * Most recent BBMP work-search queries, for the admin "recent searches"
 * panel. Every search already logs itself via logSearchHistory
 * (lib/search-history.ts, called inside searchBBMPWork) — this is the read
 * side only.
 */
export async function listRecentSearches(limit = 20): Promise<SearchHistoryRow[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("search_history")
    .select("*")
    .order("searched_at", { ascending: false })
    .limit(limit);
  logErr("listRecentSearches", error);
  return (data as SearchHistoryRow[]) ?? [];
}
