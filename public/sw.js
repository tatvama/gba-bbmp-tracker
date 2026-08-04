/**
 * Service worker for the GBA/BBMP tracker PWA + TWA shell.
 *
 * Served from /sw.js (public/) rather than a Next route so it gets root scope —
 * a worker served from a nested path can only control that path, and both the
 * offline fallback and push need whole-origin scope.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE ONE RULE: never cache HTML or RSC payloads.
 * ────────────────────────────────────────────────────────────────────────────
 * The Android app is a thin Chrome shell around the live site — that is the
 * entire reason a deploy reaches every phone without a Play Store update. A
 * service worker that served app HTML (or Next's RSC flight payloads) from
 * cache would hand users a stale copy of the app and quietly destroy that
 * guarantee, which is the whole point of the build. So: network-only for
 * everything, with a precached static fallback used ONLY when the network
 * actually fails. Nothing dynamic is ever written to the cache at runtime.
 *
 * Note the server already sends `Cache-Control: private, no-cache, no-store,
 * must-revalidate` on documents, so this policy agrees with the origin rather
 * than fighting it.
 *
 * Bump CACHE_VERSION to force old precaches out on the next activate.
 */

const CACHE_VERSION = "v1";
const CACHE_NAME = `gba-shell-${CACHE_VERSION}`;
const CACHE_PREFIX = "gba-shell-";
const OFFLINE_URL = "/offline.html";

/** Static, versioned-by-content assets only — no app routes. */
const PRECACHE_URLS = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Bypass the HTTP cache so a stale offline.html can't be adopted.
      await cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: "reload" })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

/**
 * Only top-level navigations are intercepted, and only to substitute the
 * offline page when the network is genuinely unreachable. Sub-resources, API
 * calls and server actions are left entirely alone — an intercepted POST or a
 * cached RSC fetch is how a "smart" worker breaks a server-rendered app.
 */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.mode !== "navigate") return;

  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch {
        const cache = await caches.open(CACHE_NAME);
        const offline = await cache.match(OFFLINE_URL);
        return (
          offline ??
          new Response("Offline", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          })
        );
      }
    })(),
  );
});

/**
 * Web Push. Payload shape is set by lib/push/send.ts:
 *   { title, body, url, tag }
 * Everything is defensive — a push with no/invalid data must still show
 * something, because a `push` event that resolves without calling
 * showNotification() makes the browser display its own generic
 * "site updated in the background" notice.
 */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "GBA Tracker";
  const url = payload.url || "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      // Same tag => a new digest replaces the previous one instead of stacking
      // a fresh notification every sweep. renotify still alerts the user.
      tag: payload.tag || "gba-digest",
      renotify: true,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data && event.notification.data.url;
  const url = new URL(target || "/", self.location.origin);

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Already looking at that exact page — just surface the window.
      for (const client of clientList) {
        if (new URL(client.url).pathname === url.pathname) {
          await client.focus();
          return;
        }
      }

      // An open window elsewhere in the app: focus and route it. navigate() is
      // not available in every engine, so fall back to opening a window.
      const existing = clientList[0];
      if (existing) {
        await existing.focus();
        if (typeof existing.navigate === "function") {
          try {
            await existing.navigate(url.href);
            return;
          } catch {
            /* fall through to openWindow */
          }
        } else {
          return;
        }
      }

      await self.clients.openWindow(url.href);
    })(),
  );
});
