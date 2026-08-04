import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import webpush, { WebPushError } from "web-push";

/**
 * Web Push delivery to staff devices registered in push_subscriptions
 * (migration 0052).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * IMPORT SITE RULE — the same one lib/mail/* lives under.
 * ────────────────────────────────────────────────────────────────────────────
 * Import this ONLY from request-triggered code. Today that is exactly one
 * caller: app/api/cron/notifications/route.ts. Do NOT import it from anything
 * reachable via instrumentation.ts -> lib/startup/jobs.ts. web-push needs Node
 * builtins (https, crypto, url) and that entry point bundles under the "more
 * restrictive resolution rules" instrumentation.ts's own top comment describes —
 * the identical constraint that forced nodemailer out of
 * lib/complaints/overdue-alert-scheduler.ts and into
 * lib/jobs/handlers/email-send.ts. See that scheduler's header for the full
 * account; it is load-bearing, not stylistic. If push is ever needed from a
 * sweeper, queue a background job and send from the handler instead.
 *
 * Unconfigured is a first-class state, not an error: with no VAPID keys set,
 * every function here no-ops and reports `skipped`. A deployment that has not
 * generated keys should keep working exactly as before, with email and the
 * webhook unaffected — which is also why nothing here ever throws on a delivery
 * failure. A push that fails to reach one phone must not fail the cron request.
 */

export interface PushPayload {
  title: string;
  body: string;
  /** In-app path to open on tap. Resolved against the origin by public/sw.js. */
  url?: string;
  /**
   * Notification tag. Re-using one replaces the previous notification instead
   * of stacking a new one every sweep — the digest is a running summary, so a
   * user who ignores it for a day should find one current notice, not twelve.
   */
  tag?: string;
}

export interface PushFanoutResult {
  sent: number;
  /** Transient failures; the row's failure_count was bumped. */
  failed: number;
  /** Rows deleted because the endpoint is permanently gone (404/410). */
  pruned: number;
  /** True when VAPID is unconfigured, so nothing was attempted. */
  skipped: boolean;
  reason?: string;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  failure_count: number | null;
}

let configured: boolean | null = null;

/**
 * setVapidDetails() mutates module-global state in web-push, so it is done once
 * and memoised. It also validates the key pair and THROWS on a malformed key —
 * caught here and treated as unconfigured, so a bad paste into .env degrades to
 * "no push" rather than 500-ing the cron route.
 */
function ensureConfigured(): boolean {
  if (configured !== null) return configured;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey) {
    configured = false;
    return configured;
  }

  try {
    // A mailto:/https: subject is required by the VAPID spec; some push services
    // reject a send without one, so fall back rather than send an empty subject.
    webpush.setVapidDetails(subject || "mailto:admin@rti.taatvam.com", publicKey, privateKey);
    configured = true;
  } catch (err) {
    console.warn(
      "[push] VAPID keys present but rejected by web-push; push disabled.",
      err instanceof Error ? err.message : err,
    );
    configured = false;
  }
  return configured;
}

/** True when push is usable — lets callers skip work and UI hide the toggle. */
export function isPushConfigured(): boolean {
  return ensureConfigured();
}

async function deliver(
  admin: SupabaseClient,
  rows: SubscriptionRow[],
  payload: PushPayload,
): Promise<PushFanoutResult> {
  if (!ensureConfigured()) {
    return { sent: 0, failed: 0, pruned: 0, skipped: true, reason: "VAPID keys not configured" };
  }
  if (rows.length === 0) {
    return { sent: 0, failed: 0, pruned: 0, skipped: false, reason: "No subscribed devices" };
  }

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/",
    tag: payload.tag ?? "gba-digest",
  });

  const deadEndpoints: string[] = [];
  const failedIds: Array<{ id: string; failure_count: number }> = [];
  const sentIds: string[] = [];

  // allSettled, not all: one dead endpoint must not abort the fan-out.
  await Promise.allSettled(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth_key } },
          body,
          // Digest-shaped: worth waking the screen, and pointless to hold for a
          // day if the phone is off — the next sweep will resend anyway.
          { TTL: 6 * 60 * 60, urgency: "normal" },
        );
        sentIds.push(row.id);
      } catch (err) {
        // 404/410 is the push service saying this endpoint no longer exists
        // (app uninstalled, permission revoked, browser data cleared). It will
        // never work again, so the row is deleted rather than retried forever.
        const status = err instanceof WebPushError ? err.statusCode : 0;
        if (status === 404 || status === 410) {
          deadEndpoints.push(row.endpoint);
        } else {
          failedIds.push({ id: row.id, failure_count: (row.failure_count ?? 0) + 1 });
          // Include the message, not just the status: a non-WebPushError (bad key
          // format, DNS failure, a rejected endpoint URL) carries no statusCode,
          // and logging only "status unknown" makes those undiagnosable.
          console.warn(
            `[push] send failed (status ${status || "none"}): ` +
              (err instanceof Error ? err.message : String(err)),
          );
        }
      }
    }),
  );

  if (deadEndpoints.length) {
    const { error } = await admin
      .from("push_subscriptions")
      .delete()
      .in("endpoint", deadEndpoints);
    if (error) console.warn("[push] pruning expired endpoints failed:", error.message);
  }

  if (sentIds.length) {
    const { error } = await admin
      .from("push_subscriptions")
      .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
      .in("id", sentIds);
    if (error) console.warn("[push] recording success failed:", error.message);
  }

  // Per-row because each carries its own incremented count.
  for (const f of failedIds) {
    await admin
      .from("push_subscriptions")
      .update({ failure_count: f.failure_count })
      .eq("id", f.id);
  }

  return {
    sent: sentIds.length,
    failed: failedIds.length,
    pruned: deadEndpoints.length,
    skipped: false,
  };
}

/**
 * Fans out to every registered device.
 *
 * Correct for the daily digest specifically: getNotificationDigest() applies no
 * per-user scoping (it reports what is overdue across the platform, gated only
 * by RLS), so every staff member's digest is the same digest. Sending one shared
 * summary is therefore accurate rather than a shortcut. Anything that IS
 * per-user must use sendPushToUser().
 *
 * @param admin service-role client — the caller has no session, and RLS on
 *   push_subscriptions is owner-only, so a cookie client would read zero rows.
 */
export async function sendPushToAllSubscribers(
  admin: SupabaseClient,
  payload: PushPayload,
): Promise<PushFanoutResult> {
  if (!ensureConfigured()) {
    return { sent: 0, failed: 0, pruned: 0, skipped: true, reason: "VAPID keys not configured" };
  }

  const { data, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key, failure_count");

  if (error) {
    console.warn("[push] reading subscriptions failed:", error.message);
    return { sent: 0, failed: 0, pruned: 0, skipped: true, reason: error.message };
  }

  return deliver(admin, (data ?? []) as SubscriptionRow[], payload);
}

/** Every device belonging to one user. */
export async function sendPushToUser(
  admin: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<PushFanoutResult> {
  if (!ensureConfigured()) {
    return { sent: 0, failed: 0, pruned: 0, skipped: true, reason: "VAPID keys not configured" };
  }

  const { data, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key, failure_count")
    .eq("user_id", userId);

  if (error) {
    console.warn("[push] reading subscriptions failed:", error.message);
    return { sent: 0, failed: 0, pruned: 0, skipped: true, reason: error.message };
  }

  return deliver(admin, (data ?? []) as SubscriptionRow[], payload);
}
