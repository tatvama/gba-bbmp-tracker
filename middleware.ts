import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and image files.
     *
     * sw.js / manifest.webmanifest / offline.html / .well-known are excluded
     * for the same reason as the rest: updateSession() opens a Supabase client
     * and awaits getUser() on every matched request, and none of these need a
     * session. Two of them are hot paths — the browser revalidates sw.js
     * regularly, and Chrome fetches /.well-known/assetlinks.json every time the
     * installed Android app launches (that request is what verifies the TWA and
     * suppresses the URL bar), so an auth round trip there is pure startup
     * latency. Image extensions already cover public/icons/*.png.
     */
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|offline\\.html|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
