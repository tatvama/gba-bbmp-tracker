import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  SESSION_REFRESH_AFTER_MS,
  sessionCookieOptions,
  signSessionToken,
  verifySessionToken,
} from "@/lib/session";

/**
 * Slides the rolling 6-month inactivity window forward on each request, and
 * clears a cookie that has expired or been tampered with.
 *
 * No database or network access: the session is a signed token, so this is pure
 * local crypto. (Under Supabase this handler awaited an HTTP getUser() call on
 * every matched request, which is why the matcher below works so hard to exclude
 * hot static paths.) Route protection is NOT done here and never was — pages and
 * server actions enforce it with requireRole() in lib/auth.ts.
 */
export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return NextResponse.next();

  const response = NextResponse.next();
  const payload = await verifySessionToken(token);

  if (!payload) {
    // Expired, malformed, or signed with a rotated secret: stop sending it.
    response.cookies.set(SESSION_COOKIE_NAME, "", {
      ...sessionCookieOptions(),
      maxAge: 0,
    });
    return response;
  }

  // Re-issue at most hourly rather than on every request, so an active session
  // keeps sliding without a Set-Cookie on each navigation.
  if (Date.now() - payload.iat > SESSION_REFRESH_AFTER_MS) {
    response.cookies.set(
      SESSION_COOKIE_NAME,
      await signSessionToken(payload.uid),
      sessionCookieOptions(),
    );
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and image files.
     *
     * sw.js / manifest.webmanifest / offline.html / .well-known are excluded
     * because none of them need a session. Two are hot paths — the browser
     * revalidates sw.js regularly, and Chrome fetches
     * /.well-known/assetlinks.json every time the installed Android app
     * launches (that request is what verifies the TWA and suppresses the URL
     * bar). Image extensions already cover public/icons/*.png.
     */
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|offline\\.html|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
