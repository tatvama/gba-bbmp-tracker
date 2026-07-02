import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMPLAINT_OPEN_STATUSES } from "@/lib/constants";
import { runAdvisorAnalysis } from "@/lib/ai/advisor/recommendation-engine";

export const runtime = "nodejs";
export const maxDuration = 60;

const BATCH_SIZE = 200;
const CONCURRENCY = 5;
const STALE_HOURS = 20;

/**
 * Scheduled AI Advisor sweep. Every other trigger is event-driven (a call added
 * at the end of a complaint-mutating server action) — this cron is the ONLY
 * trigger for time-elapsed conditions where nothing else fires, e.g. "no reply
 * for 18 days" with no user action taken in between.
 *
 *   curl -H "x-cron-secret: $CRON_SECRET" https://yoursite/api/cron/ai-advisor
 *
 * Auth: requires CRON_SECRET (header `x-cron-secret` or `?secret=`), same as
 * /api/cron/notifications.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not configured on the server." }, { status: 503 });
  }
  const provided = req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret") ?? "";
  if (provided !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const staleCutoff = new Date(Date.now() - STALE_HOURS * 3_600_000).toISOString();

  // Candidates where nothing else would have triggered a re-analysis: the
  // follow-up date has passed, or there's no recent analysis on record.
  const { data: overdue } = await admin
    .from("complaints")
    .select("id")
    .in("status", COMPLAINT_OPEN_STATUSES)
    .is("deleted_at", null)
    .lt("next_follow_up_date", today)
    .limit(BATCH_SIZE);

  const { data: staleRecoIds } = await admin
    .from("complaint_ai_recommendations")
    .select("complaint_id")
    .or(`last_analyzed_at.is.null,last_analyzed_at.lt.${staleCutoff}`)
    .limit(BATCH_SIZE);

  const ids = new Set<string>();
  for (const c of overdue ?? []) ids.add(c.id as string);
  for (const r of staleRecoIds ?? []) ids.add(r.complaint_id as string);
  const candidates = Array.from(ids).slice(0, BATCH_SIZE);

  let analyzed = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((id) => runAdvisorAnalysis(admin, id)));
    for (const r of results) {
      if (!r.ok) failed++;
      else if (r.skipped) skipped++;
      else analyzed++;
    }
  }

  return NextResponse.json({ ok: true, scanned: candidates.length, analyzed, skipped, failed });
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
