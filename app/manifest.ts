import type { MetadataRoute } from "next";

/**
 * Web app manifest, served at /manifest.webmanifest.
 *
 * Two consumers, and the second is why the icon set is strict:
 *  1. Chrome/Android "Add to home screen" (and desktop install).
 *  2. `bubblewrap init --manifest https://rti.taatvam.com/manifest.webmanifest`,
 *     which reads THIS file to generate the Trusted Web Activity APK — the app
 *     name, colours and launcher icon in the built APK all come from here, not
 *     from anything in android-twa/. Bubblewrap requires a 512px icon and will
 *     refuse to init without one.
 *
 * `display: "standalone"` is what removes the browser UI in the installed app.
 * `scope: "/"` keeps every in-app link inside the TWA; anything off-origin
 * opens in a normal browser tab, which is the behaviour we want.
 *
 * Deliberately no `orientation`: this app is table- and map-heavy (the wards /
 * complaints / audit tables and the Leaflet views), so locking to portrait
 * would make it worse on a phone held sideways, not better.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "GBA · BBMP Ward & Engineer Tracker",
    short_name: "GBA Tracker",
    description:
      "Trace any Bengaluru locality across the 198 → 225 → 369 ward restructures and reach the responsible engineering sub-division.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    // Matches the blue in app/icon.svg — Android tints the status bar and the
    // TWA splash screen with this.
    theme_color: "#1e40af",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // Separate art with the mark inset into the centre 80%, so Android can
      // crop it to a circle/squircle/rounded-square per launcher without
      // clipping the "GBA" text. A single "any maskable" icon would get
      // visibly cropped on round-icon launchers.
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
