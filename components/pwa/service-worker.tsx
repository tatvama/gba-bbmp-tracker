"use client";

import * as React from "react";

/**
 * Registers /sw.js once per page load. Renders nothing.
 *
 * Mounted in app/layout.tsx so it runs on every route, including /login and
 * /app — the install page has to be able to register the worker for a user who
 * hasn't signed in yet, otherwise push could never be enabled on a fresh phone.
 *
 * Registration is only ever this: no permission prompt, no subscription. Asking
 * for notification permission on page load is what gets a site permanently
 * blocked by the user (and Chrome penalises it), so that is deliberately left
 * to an explicit tap in components/nav/notifications-bell.tsx.
 *
 * `updateViaCache: "none"` makes the browser revalidate sw.js against the
 * network instead of its HTTP cache, so a corrected worker actually ships
 * instead of being pinned for up to 24h.
 */
export function ServiceWorkerRegistrar() {
  React.useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;

    // Registration competes with the page's own first data fetches for the
    // network; deferring past load keeps it off the critical path.
    const register = () => {
      if (cancelled) return;
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch((err) => {
          // Never fatal — the app is fully functional without a worker; only the
          // offline fallback and push depend on it.
          console.warn("[pwa] service worker registration failed", err);
        });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", register);
    };
  }, []);

  return null;
}
