/**
 * Publishes the signed Android APK to R2 so /app can hand it out.
 *
 *   npm run apk:publish -- --dry-run   # inspect what would happen, upload nothing
 *   npm run apk:publish                # upload
 *
 * Reuses lib/storage/r2-upload.ts (and therefore the R2_* env vars the app
 * already uses) rather than opening a second S3 client. Run via
 * `tsx --tsconfig scripts/tsconfig.pipeline.json` — that mapping stubs out
 * `server-only`, which r2-upload.ts imports; this is the same invocation
 * scripts/import-ack-zip.ts uses.
 *
 * Two objects are written per release:
 *
 *   app/GBA-Tracker-<version>.apk   immutable — a given version's bytes never
 *                                  change, so it can be cached forever and an
 *                                  install link stays valid indefinitely.
 *   app/latest.json                 the pointer /app reads to discover the
 *                                  current version, size, hash and URL.
 *
 * The indirection is what keeps a new APK from needing a site redeploy: the
 * download page resolves latest.json at request time, so publishing a build is
 * one command with no deploy attached. Overwriting a single fixed APK key would
 * be simpler but risks a CDN serving the previous build's bytes under a URL
 * users have already been given.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { uploadToR2, getR2PublicUrl } from "@/lib/storage/r2-upload";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
config({ path: join(root, ".env") });

const DRY_RUN = process.argv.includes("--dry-run");
const DIST_DIR = join(root, "android-twa", "dist");
const TWA_MANIFEST = join(root, "android-twa", "twa-manifest.json");

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function main() {
  if (!existsSync(TWA_MANIFEST)) fail(`No twa-manifest.json at ${TWA_MANIFEST}`);
  const twa = JSON.parse(readFileSync(TWA_MANIFEST, "utf8")) as {
    appVersionName?: string;
    appVersionCode?: number;
    packageId?: string;
  };
  const version = twa.appVersionName ?? "0.0.0";
  const versionCode = twa.appVersionCode ?? 0;

  if (!existsSync(DIST_DIR)) {
    fail(`No build output at ${DIST_DIR} — build and sign first (see android-twa/README.md).`);
  }
  // .idsig sits next to the APK (apksigner v4 signature); it is not the artifact.
  const apks = readdirSync(DIST_DIR).filter((f) => f.endsWith(".apk"));
  if (apks.length === 0) fail(`No .apk in ${DIST_DIR} — build and sign first.`);
  if (apks.length > 1) {
    fail(`Expected exactly one .apk in ${DIST_DIR}, found ${apks.length}: ${apks.join(", ")}`);
  }

  const apkPath = join(DIST_DIR, apks[0]!);
  const bytes = readFileSync(apkPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const sizeMb = (bytes.length / 1024 / 1024).toFixed(2);
  const builtAt = statSync(apkPath).mtime.toISOString();

  const apkKey = `app/GBA-Tracker-${version}.apk`;
  const pointerKey = "app/latest.json";

  console.log(`  file        ${basename(apkPath)}`);
  console.log(`  version     ${version} (versionCode ${versionCode})`);
  console.log(`  package     ${twa.packageId ?? "?"}`);
  console.log(`  size        ${sizeMb} MB`);
  console.log(`  sha256      ${sha256}`);
  console.log(`  built       ${builtAt}`);

  const apkUrl = getR2PublicUrl(apkKey);
  const pointer = {
    version,
    versionCode,
    packageId: twa.packageId ?? null,
    url: apkUrl,
    sizeBytes: bytes.length,
    sha256,
    builtAt,
    publishedAt: new Date().toISOString(),
  };

  console.log(`\n  → ${apkKey}`);
  console.log(`  → ${pointerKey}`);
  console.log(`  public URL  ${apkUrl}`);

  if (DRY_RUN) {
    console.log("\n✓ Dry run — nothing uploaded.");
    console.log("  latest.json would be:\n" + JSON.stringify(pointer, null, 2));
    return;
  }

  void (async () => {
    // APK first: if the pointer went up first and this failed, /app would
    // advertise a version nobody can download.
    await uploadToR2({
      key: apkKey,
      body: bytes,
      contentType: "application/vnd.android.package-archive",
      contentLength: bytes.length,
    });
    console.log(`✓ uploaded ${apkKey}`);

    const pointerBody = Buffer.from(JSON.stringify(pointer, null, 2), "utf8");
    await uploadToR2({
      key: pointerKey,
      body: pointerBody,
      contentType: "application/json",
      contentLength: pointerBody.length,
    });
    console.log(`✓ uploaded ${pointerKey}`);
    console.log(`\n✓ Published. /app will pick this up within its revalidate window.`);
  })().catch((e) => fail(e instanceof Error ? e.message : String(e)));
}

main();
