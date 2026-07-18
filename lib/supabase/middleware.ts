import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  LAST_ACTIVE_COOKIE_NAME,
  SESSION_INACTIVITY_LIMIT_MS,
} from "@/lib/supabase/constants";

/**
 * Refreshes the Supabase auth session cookie on every matched request, and
 * enforces a rolling 6-month inactivity expiry: a browser that doesn't send
 * a request for that long is signed out server-side (Supabase's own auth
 * cookies persist far longer than that by default, so this is tracked with
 * a separate plain cookie rather than relying on cookie maxAge).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const lastActiveMs = Number(request.cookies.get(LAST_ACTIVE_COOKIE_NAME)?.value);
    const isStale =
      Number.isFinite(lastActiveMs) &&
      Date.now() - lastActiveMs > SESSION_INACTIVITY_LIMIT_MS;

    if (isStale) {
      // Last seen over 6 months ago: revoke the session so the next
      // authenticated action prompts a fresh login.
      await supabase.auth.signOut();
      supabaseResponse.cookies.set(LAST_ACTIVE_COOKIE_NAME, "", {
        maxAge: 0,
        path: "/",
      });
    } else {
      // Active within the window (or first time seeing this cookie) -
      // slide the expiry forward from now.
      supabaseResponse.cookies.set(LAST_ACTIVE_COOKIE_NAME, String(Date.now()), {
        maxAge: SESSION_INACTIVITY_LIMIT_MS / 1000,
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }
  }

  return supabaseResponse;
}
