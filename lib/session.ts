/**
 * Signed session tokens — the replacement for Supabase Auth's JWT cookies.
 *
 * Deliberately free of any database or Node-only import: middleware.ts runs in
 * the Edge runtime, where `pg` cannot load. Verification here is pure crypto on
 * a self-contained token, so the middleware can slide a session forward without
 * a database round trip (the old code paid an HTTP call to Supabase on every
 * matched request to do the same thing).
 *
 * Web Crypto rather than node:crypto for the same reason — `crypto.subtle`
 * exists in both the Edge runtime and Node 18+, so one implementation serves
 * middleware, server components and server actions alike.
 *
 * Token format:  base64url(JSON payload) "." base64url(HMAC-SHA256(payload))
 * The payload is signed, not encrypted: it carries no secret, only a user id
 * and timestamps, and any edit to it invalidates the signature.
 */

export const SESSION_COOKIE_NAME = "gba-session";

/**
 * Rolling inactivity window. A browser that goes this long without a request is
 * signed out — the same 6 months the previous implementation enforced with a
 * separate `gba-last-active` cookie. That workaround existed because
 * @supabase/ssr pinned its own cookie lifetime; this cookie is ours, so the
 * expiry lives in the signed payload where it cannot be edited by the client.
 */
export const SESSION_INACTIVITY_LIMIT_MS = 1000 * 60 * 60 * 24 * 180;

/**
 * How stale a token may get before the middleware re-issues it. Without this
 * every single request would rewrite the cookie; an hour keeps Set-Cookie rare
 * while still sliding the window far more often than it needs to be slid.
 */
export const SESSION_REFRESH_AFTER_MS = 1000 * 60 * 60;

export interface SessionPayload {
  /** app_users.id */
  uid: string;
  /** Issued at, epoch ms. */
  iat: number;
  /** Expires at, epoch ms. */
  exp: number;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function requireSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET is missing or too short (need at least 32 characters). " +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"',
    );
  }
  return secret;
}

const keyCache = new Map<string, Promise<CryptoKey>>();

function getKey(): Promise<CryptoKey> {
  const secret = requireSecret();
  const cached = keyCache.get(secret);
  if (cached) return cached;
  const key = crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  keyCache.set(secret, key);
  return key;
}

/** Mints a token for `userId`, valid for the full inactivity window. */
export async function signSessionToken(userId: string, now = Date.now()): Promise<string> {
  const payload: SessionPayload = {
    uid: userId,
    iat: now,
    exp: now + SESSION_INACTIVITY_LIMIT_MS,
  };
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await getKey(),
    new TextEncoder().encode(body),
  );
  return `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * Returns the payload of a valid, unexpired token, or null. Never throws on
 * malformed input — a corrupt or tampered cookie is simply "not signed in".
 */
export async function verifySessionToken(
  token: string | undefined | null,
  now = Date.now(),
): Promise<SessionPayload | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await getKey(),
      base64UrlDecode(signature),
      new TextEncoder().encode(body),
    );
    if (!ok) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as SessionPayload;
    if (typeof payload?.uid !== "string" || typeof payload?.exp !== "number") return null;
    if (payload.exp <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Cookie attributes, kept identical everywhere the cookie is written. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_INACTIVITY_LIMIT_MS / 1000,
  };
}
