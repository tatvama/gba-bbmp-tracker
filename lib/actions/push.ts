"use server";

import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/db";

/**
 * Register / remove this browser's Web Push endpoint.
 *
 * Deliberately uses the COOKIE client, not the admin client: RLS on
 * push_subscriptions is owner-only (migration 0052), so writing through the
 * signed-in user's client makes the database enforce that a user can only ever
 * register or delete their own device. Reaching for createAdminClient() here
 * would bypass the one check that matters — an endpoint is a capability to send
 * that device a notification.
 *
 * The SENDER (lib/push/send.ts) is the opposite case and does need the admin
 * client, because it runs from cron with no session.
 *
 * These return a result object instead of throwing. The caller is a toggle in
 * the top bar (components/nav/push-toggle.tsx); a failure there should leave the
 * switch un-ticked with a message, not blow up the page.
 */

/** Shape of a browser PushSubscription, as produced by subscription.toJSON(). */
const subscriptionSchema = z.object({
  endpoint: z.string().url().min(1),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export interface PushActionResult {
  ok: boolean;
  error?: string;
}

export async function subscribeToPush(
  raw: unknown,
  userAgent?: string,
): Promise<PushActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in to enable alerts." };

  const parsed = subscriptionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid push subscription." };

  const { endpoint, keys } = parsed.data;
  const db = await createClient();

  // Upsert on endpoint: re-subscribing the same browser yields the SAME
  // endpoint, so this refreshes the row (including re-homing it if a different
  // user signs in on a shared device) instead of colliding on the unique index.
  const { error } = await db.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth_key: keys.auth,
      user_agent: userAgent?.slice(0, 400) ?? null,
      failure_count: 0,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    console.warn("[push] subscribe failed:", error.message);
    return { ok: false, error: "Could not save this device. Try again." };
  }

  return { ok: true };
}

export async function unsubscribeFromPush(endpoint: string): Promise<PushActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (!endpoint) return { ok: false, error: "Missing endpoint." };

  const db = await createClient();
  // RLS already restricts this to the caller's rows; the explicit user_id match
  // keeps the intent visible at the call site rather than implied by policy.
  const { error } = await db
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);

  if (error) {
    console.warn("[push] unsubscribe failed:", error.message);
    return { ok: false, error: "Could not remove this device." };
  }

  return { ok: true };
}
