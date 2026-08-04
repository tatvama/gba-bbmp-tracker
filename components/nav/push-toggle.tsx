"use client";

import * as React from "react";
import { BellRing, Loader2 } from "lucide-react";
import { subscribeToPush, unsubscribeFromPush } from "@/lib/actions/push";

/**
 * "Alerts on this phone" switch, shown in the notifications bell dropdown.
 *
 * Permission is requested ONLY from this tap. Calling requestPermission() on page
 * load is what gets a site permanently blocked — the browser remembers a dismissal
 * and there is no second chance, so the prompt has to follow a deliberate action.
 *
 * Renders nothing at all when push can't work (no VAPID key configured, or a
 * browser without the APIs) rather than showing a dead control. The most common
 * real-world case for that is iOS Safari, which only exposes PushManager to an
 * installed home-screen app.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/**
 * The applicationServerKey must be raw bytes. Chrome accepts a base64url string
 * too, but Firefox does not, so convert rather than rely on that.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalised);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

type State = "loading" | "off" | "on" | "denied" | "busy";

export function PushToggle() {
  const [state, setState] = React.useState<State>("loading");
  const [error, setError] = React.useState<string | null>(null);

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  React.useEffect(() => {
    if (!supported || !VAPID_PUBLIC_KEY) return;

    let cancelled = false;
    (async () => {
      try {
        if (Notification.permission === "denied") {
          if (!cancelled) setState("denied");
          return;
        }
        // Resolves once ServiceWorkerRegistrar's registration is active.
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (!cancelled) setState(existing ? "on" : "off");
      } catch {
        if (!cancelled) setState("off");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supported]);

  async function enable() {
    setError(null);
    setState("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        // Required by Chrome: every push must result in a visible notification.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
      });

      const res = await subscribeToPush(sub.toJSON(), navigator.userAgent);
      if (!res.ok) {
        // Don't leave a browser-side subscription the server has no row for —
        // it would look enabled while never receiving anything.
        await sub.unsubscribe().catch(() => {});
        setError(res.error ?? "Could not enable alerts.");
        setState("off");
        return;
      }
      setState("on");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enable alerts.");
      setState("off");
    }
  }

  async function disable() {
    setError(null);
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // Server row first: if the browser unsubscribes but the delete fails, the
        // endpoint keeps receiving pushes it can no longer display until the push
        // service 410s it.
        await unsubscribeFromPush(sub.endpoint);
        await sub.unsubscribe().catch(() => {});
      }
      setState("off");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not turn off alerts.");
      setState("on");
    }
  }

  if (!supported || !VAPID_PUBLIC_KEY || state === "loading") return null;

  return (
    <div className="border-t px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <BellRing className="h-3 w-3 shrink-0" />
          Alerts on this device
        </span>

        {state === "denied" ? (
          <span className="text-[10px] font-medium text-muted-foreground">Blocked</span>
        ) : (
          <button
            type="button"
            onClick={() => void (state === "on" ? disable() : enable())}
            disabled={state === "busy"}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-60 ${
              state === "on"
                ? "text-muted-foreground hover:bg-muted"
                : "bg-primary/10 text-primary hover:bg-primary/15"
            }`}
          >
            {state === "busy" && <Loader2 className="h-3 w-3 animate-spin" />}
            {state === "on" ? "Turn off" : "Turn on"}
          </button>
        )}
      </div>

      {state === "denied" && (
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
          Notifications are blocked for this site. Re-allow them in the browser&apos;s
          site settings, then reopen this menu.
        </p>
      )}
      {error && <p className="mt-1 text-[10px] leading-snug text-destructive">{error}</p>}
    </div>
  );
}
