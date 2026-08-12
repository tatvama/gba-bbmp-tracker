import Link from "next/link";
import QRCode from "qrcode";
import { Download, Smartphone, ShieldCheck, RefreshCw, Bell } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getR2PublicUrl } from "@/lib/storage/r2-upload";

export const metadata = { title: "Install the Android app" };

/**
 * Public install page for the Android app (a Trusted Web Activity shell — see
 * android-twa/README.md).
 *
 * Deliberately NOT gated on a session: whoever installs this has, by definition,
 * not signed in on that phone yet. Nothing here is sensitive — it is a download
 * link and instructions. `updateSession` (lib/db/middleware.ts) only
 * refreshes cookies and gates nothing, so no matcher change was needed.
 *
 * Release metadata is resolved at request time from app/latest.json in R2, which
 * `npm run apk:publish` writes. That indirection is what lets a new APK be
 * published without redeploying the site.
 */

const SITE_URL = process.env.SITE_URL ?? "https://rti.taatvam.com";
const INSTALL_PAGE_URL = `${SITE_URL.replace(/\/$/, "")}/app`;

interface Release {
  version: string;
  versionCode: number;
  url: string;
  sizeBytes: number;
  sha256: string;
  publishedAt: string;
}

/**
 * Never throws: an unpublished (or briefly unreachable) latest.json must render
 * the "not published yet" state, not a 500 on a public page.
 */
async function getRelease(): Promise<Release | null> {
  let pointerUrl: string;
  try {
    pointerUrl = getR2PublicUrl("app/latest.json");
  } catch {
    // R2_PUBLIC_URL unset — nothing has ever been published from this deploy.
    return null;
  }

  try {
    const res = await fetch(pointerUrl, {
      // Long enough that the page isn't hammering R2, short enough that a fresh
      // publish shows up without anyone redeploying.
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<Release>;
    if (!data.url || !data.version) return null;
    return data as Release;
  } catch {
    return null;
  }
}

export default async function InstallAppPage() {
  const release = await getRelease();
  // SVG rather than a data-URI PNG: sharper at any size, and no second asset to
  // request. Colours are pinned to opaque brand-on-white rather than theme
  // tokens: a scanner needs real contrast between the modules and their
  // background, and a transparent QR sitting on the dark theme's near-black
  // surface is dark blue on dark — visually fine but unreliable to scan. The
  // wrapper below keeps the white plate in both themes for the same reason.
  const qrSvg = await QRCode.toString(INSTALL_PAGE_URL, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#1e40af", light: "#ffffff" },
  });

  const sizeMb = release ? (release.sizeBytes / 1024 / 1024).toFixed(1) : null;

  return (
    <div>
      <PageHeader
        title="Install the Android app"
        description="Put the tracker on your phone with its own icon — complaints, RTIs, ward lookup and document scanning, all in one tap."
        breadcrumbs={[{ label: "Install app" }]}
        badge={
          release ? (
            <Badge variant="secondary">v{release.version}</Badge>
          ) : (
            <Badge variant="outline">Not published yet</Badge>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-5">
          <Card>
            <CardContent className="space-y-4 pt-6">
              {release ? (
                <>
                  <Button asChild size="lg" className="w-full sm:w-auto">
                    <a href={release.url} download>
                      <Download className="mr-2 h-4 w-4" />
                      Download for Android ({sizeMb} MB)
                    </a>
                  </Button>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:max-w-md">
                    <dt className="text-muted-foreground">Version</dt>
                    <dd className="font-medium">
                      {release.version} (build {release.versionCode})
                    </dd>
                    <dt className="text-muted-foreground">Published</dt>
                    <dd className="font-medium">
                      {new Date(release.publishedAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </dd>
                    <dt className="text-muted-foreground">Requires</dt>
                    <dd className="font-medium">Android 6.0 or newer</dd>
                  </dl>
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer font-medium hover:text-foreground">
                      Verify the download (SHA-256)
                    </summary>
                    <code className="mt-2 block break-all rounded bg-muted p-2 font-mono text-[10px] leading-relaxed">
                      {release.sha256}
                    </code>
                  </details>
                </>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium">No build published yet.</p>
                  <p className="text-xs text-muted-foreground">
                    Build and sign the APK, then run{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono">
                      npm run apk:publish
                    </code>
                    . See{" "}
                    <span className="font-mono">android-twa/README.md</span> for the
                    full steps. This page picks the release up on its own — no
                    redeploy needed.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Smartphone className="h-4 w-4 text-primary" />
                How to install
              </h2>
              <ol className="space-y-2.5 text-xs leading-relaxed text-muted-foreground">
                <li>
                  <span className="font-semibold text-foreground">1.</span> Tap
                  <span className="font-medium text-foreground"> Download for Android</span>{" "}
                  above, on the phone itself.
                </li>
                <li>
                  <span className="font-semibold text-foreground">2.</span> Android will
                  warn that the file came from outside the Play Store. Choose{" "}
                  <span className="font-medium text-foreground">Download anyway</span>, then
                  open the file.
                </li>
                <li>
                  <span className="font-semibold text-foreground">3.</span> If it asks
                  about installing unknown apps, tap{" "}
                  <span className="font-medium text-foreground">Settings</span> and turn on{" "}
                  <span className="font-medium text-foreground">
                    Allow from this source
                  </span>
                  , then go back and tap{" "}
                  <span className="font-medium text-foreground">Install</span>.
                </li>
                <li>
                  <span className="font-semibold text-foreground">4.</span> Open{" "}
                  <span className="font-medium text-foreground">GBA Tracker</span> from the
                  home screen and sign in as usual.
                </li>
              </ol>
              <p className="mt-3 border-t pt-3 text-[11px] text-muted-foreground">
                That one-time warning is normal for an app distributed directly rather
                than through the Play Store. The file is signed with our own
                certificate — the SHA-256 above lets you confirm it is the same build.
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                icon: RefreshCw,
                title: "Always current",
                body: "The app loads the live site, so every update appears immediately. You will never be asked to reinstall for a new feature.",
              },
              {
                icon: Bell,
                title: "Phone alerts",
                body: "Turn on alerts from the bell menu to get overdue complaints and RTIs as notifications.",
              },
              {
                icon: ShieldCheck,
                title: "Same login",
                body: "Your existing email or phone sign-in works. Camera scanning and PDF downloads work exactly as in the browser.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <Card key={title}>
                <CardContent className="pt-5">
                  <Icon className="mb-2 h-4 w-4 text-primary" />
                  <h3 className="text-xs font-semibold">{title}</h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Card className="h-fit">
          <CardContent className="pt-6 text-center">
            <h2 className="text-sm font-semibold">Installing on a phone?</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Scan this with the phone&apos;s camera to open this page there.
            </p>
            <div
              className="mx-auto mt-4 w-44 rounded-lg bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
              // eslint-disable-next-line react/no-danger -- server-generated SVG from a build-time constant URL, no user input
              dangerouslySetInnerHTML={{ __html: qrSvg }}
              role="img"
              aria-label={`QR code linking to ${INSTALL_PAGE_URL}`}
            />
            <p className="mt-3 break-all font-mono text-[10px] text-muted-foreground">
              {INSTALL_PAGE_URL}
            </p>
            <p className="mt-4 border-t pt-3 text-[11px] text-muted-foreground">
              Prefer no install? The site works in any mobile browser —{" "}
              <Link href="/" className="font-medium text-primary hover:underline">
                open it directly
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
