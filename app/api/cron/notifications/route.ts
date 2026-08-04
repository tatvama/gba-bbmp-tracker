import { NextResponse, type NextRequest } from "next/server";
import { getNotificationDigest } from "@/lib/queries";
import { createAdminClient } from "@/lib/supabase/admin";
// Safe import site: this is request-triggered code, never reached from
// instrumentation.ts's graph. See the import-site rule in lib/push/send.ts.
import { sendPushToAllSubscribers, isPushConfigured } from "@/lib/push/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled notification job. Point any scheduler at this route (Coolify cron,
 * cron-job.org, GitHub Actions, Supabase pg_cron) e.g. every morning:
 *   curl -H "x-cron-secret: $CRON_SECRET" https://yoursite/api/cron/notifications
 *
 * Auth: requires CRON_SECRET (header `x-cron-secret` or `?secret=`).
 * Dispatch — independent and each optional:
 *   - NOTIFY_WEBHOOK_URL set: the digest is POSTed there (e.g. a Make.com
 *     webhook that fans out WhatsApp / SMS / email);
 *   - VAPID keys set: a Web Push notification goes to every staff device in
 *     push_subscriptions (the Android app / installed PWA);
 *   - neither: the route just returns the digest JSON — safe and testable with
 *     no external setup.
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

  // Service-role client, NOT the default cookie client. A cron request carries no
  // session, and `reminders` / `job_audits` are not anon-readable — RLS returns
  // those as empty rather than as an error, so the previous session-less call
  // silently reported dueReminders: 0 and highRiskAudits: 0. Measured against
  // this database that was 0 in place of 5 and 2, with both suppressed audits in
  // the `bill_stop` band. See getNotificationDigest() in lib/queries.ts.
  const admin = createAdminClient();
  const digest = await getNotificationDigest(admin);

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

  // Gated on the same totalDue as the webhook, which deliberately EXCLUDES
  // highRiskAudits: that section has no date filter (any job still in the
  // bill_stop/serious band qualifies), so counting it here would push an
  // identical notification every day for as long as the finding exists. The
  // audits still travel in the digest body and the webhook payload.
  let push: Awaited<ReturnType<typeof sendPushToAllSubscribers>> | null = null;
  if (totalDue > 0) {
    try {
      push = await sendPushToAllSubscribers(admin, {
        title: `${totalDue} item${totalDue === 1 ? "" : "s"} need attention`,
        body: describeCounts(digest.counts),
        url: deepLink(digest.counts),
        tag: "gba-digest",
      });
    } catch (e) {
      // Per-device failures are already swallowed inside the sender; this only
      // catches something unexpected, and must not fail the cron request.
      dispatchError = dispatchError ?? (e instanceof Error ? e.message : "Push failed");
    }
  }

  return NextResponse.json({
    ok: true,
    counts: digest.counts,
    totalDue,
    dispatched,
    dispatchError,
    webhookConfigured: !!webhook,
    pushConfigured: isPushConfigured(),
    push,
    digest,
  });
}

/** e.g. "4 overdue complaints · 5 overdue RTIs · 5 reminders due" */
function describeCounts(counts: {
  overdueRtis: number;
  overdueComplaints: number;
  dueReminders: number;
}): string {
  const parts: string[] = [];
  if (counts.overdueComplaints) {
    parts.push(
      `${counts.overdueComplaints} overdue complaint${counts.overdueComplaints === 1 ? "" : "s"}`,
    );
  }
  if (counts.overdueRtis) {
    parts.push(`${counts.overdueRtis} overdue RTI${counts.overdueRtis === 1 ? "" : "s"}`);
  }
  if (counts.dueReminders) {
    parts.push(`${counts.dueReminders} reminder${counts.dueReminders === 1 ? "" : "s"} due`);
  }
  return parts.join(" · ");
}

/**
 * Open the list page for whichever category is largest, so the tap lands
 * somewhere actionable. Reminders have no list route of their own, so a
 * reminders-only digest falls through to the dashboard.
 */
function deepLink(counts: { overdueRtis: number; overdueComplaints: number }): string {
  if (counts.overdueComplaints > 0 && counts.overdueComplaints >= counts.overdueRtis) {
    return "/complaints";
  }
  if (counts.overdueRtis > 0) return "/rti";
  return "/";
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
