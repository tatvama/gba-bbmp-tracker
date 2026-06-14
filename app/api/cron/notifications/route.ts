import { NextResponse, type NextRequest } from "next/server";
import { getNotificationDigest } from "@/lib/queries";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Scheduled notification job. Point any scheduler at this route (Coolify cron,
 * cron-job.org, GitHub Actions, Supabase pg_cron) e.g. every morning:
 *   curl -H "x-cron-secret: $CRON_SECRET" https://yoursite/api/cron/notifications
 *
 * Auth: requires CRON_SECRET (header `x-cron-secret` or `?secret=`).
 * Dispatch: if NOTIFY_WEBHOOK_URL is set, the digest is POSTed there (e.g. a
 * Make.com webhook that fans out WhatsApp / SMS / email). Without it, the route
 * just returns the digest JSON — safe and testable with no external setup.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured on the server." },
      { status: 503 },
    );
  }
  const provided =
    req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret") ?? "";
  if (provided !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const digest = await getNotificationDigest();

  let dispatched = false;
  let dispatchError: string | null = null;
  const webhook = process.env.NOTIFY_WEBHOOK_URL;
  const totalDue =
    digest.counts.overdueRtis + digest.counts.overdueComplaints + digest.counts.dueReminders;

  if (webhook && totalDue > 0) {
    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "bbmp_notification_digest", ...digest }),
      });
      dispatched = res.ok;
      if (!res.ok) dispatchError = `Webhook returned ${res.status}`;
    } catch (e) {
      dispatchError = e instanceof Error ? e.message : "Webhook POST failed";
    }
  }

  return NextResponse.json({
    ok: true,
    counts: digest.counts,
    totalDue,
    dispatched,
    dispatchError,
    webhookConfigured: !!webhook,
    digest,
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
