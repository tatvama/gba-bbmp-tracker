import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Plain (non-"use server") background_jobs reads — deliberately NOT in
 * lib/actions/jobs.ts so the SSE route (app/api/jobs/events/route.ts) can
 * call it directly with an explicit admin client + userId, the same reason
 * lib/import-queue/store.ts's listImportSessions lives outside any "use
 * server" file: a long-lived streaming response shouldn't re-derive the
 * session from cookies() on every snapshot push.
 */

export interface JobRow {
  id: string;
  type: string;
  status: "queued" | "running" | "retrying" | "done" | "failed" | "cancelled";
  title: string | null;
  entity_type: string | null;
  entity_id: string | null;
  progress: number | null;
  result: unknown;
  error: string | null;
  created_at: string;
  updated_at: string | null;
  finished_at: string | null;
  cancel_requested: boolean;
  retry_count: number;
  max_retries: number;
  next_retry_at: string | null;
}

const COLS =
  "id,type,status,title,entity_type,entity_id,progress,result,error,created_at,updated_at,finished_at,cancel_requested,retry_count,max_retries,next_retry_at";

/** Active (queued/running/retrying) jobs plus a recent-history window of
 *  terminal ones, for a specific user — the Global Task Center's data. */
export async function listActiveAndRecentJobs(admin: SupabaseClient, userId: string, recentHours = 24): Promise<JobRow[]> {
  const cutoff = new Date(Date.now() - recentHours * 3_600_000).toISOString();
  const { data } = await admin
    .from("background_jobs")
    .select(COLS)
    .eq("created_by", userId)
    .or(`status.in.(queued,running,retrying),created_at.gte.${cutoff}`)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data as JobRow[]) ?? [];
}
