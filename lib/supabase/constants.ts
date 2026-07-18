/**
 * Rolling inactivity window for signed-in sessions. `@supabase/ssr` (0.5.2)
 * hardcodes its own auth cookies to a fixed ~400-day maxAge regardless of any
 * cookieOptions override, so the 6-month expiry is enforced ourselves in
 * lib/supabase/middleware.ts via a separate plain cookie rather than by
 * configuring the Supabase client.
 */
export const SESSION_INACTIVITY_LIMIT_MS = 1000 * 60 * 60 * 24 * 180;

/** Plain (non-Supabase) cookie storing the epoch-ms timestamp of last activity. */
export const LAST_ACTIVE_COOKIE_NAME = "gba-last-active";
