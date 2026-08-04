/**
 * Renders the PNG launcher icons that the web manifest (app/manifest.ts) and the
 * TWA build both need, into public/icons/.
 *
 *   npm run icons:gen
 *
 * Rasterises the same geometry as app/icon.svg with sharp, with ONE deliberate
 * difference: the font-family. icon.svg asks for `system-ui, -apple-system,
 * sans-serif`, but sharp rasterises SVG through librsvg, which resolves fonts
 * via fontconfig and has no notion of the `system-ui` CSS keyword — the text
 * silently vanishes or falls back, leaving a plain blue square. Naming concrete
 * families instead makes the output deterministic. (@napi-rs/canvas would be
 * the other option and is also a dependency, but its native binding is blocked
 * by Windows Application Control on this machine — see the note in README.)
 *
 * Kept as a generator producing checked-in PNGs rather than a build step: these
 * change only when the brand mark changes, and the TWA build reads them over
 * HTTP from the deployed site anyway.
 */
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/** Same blue as app/icon.svg's <rect fill> and the manifest theme_color. */
const BRAND = "#1e40af";
const LABEL = "GBA";

/**
 * Concrete families, heaviest-first. librsvg walks these in order and falls
 * back to the next when one isn't installed, so this covers both this Windows
 * box (Arial) and a Linux container (DejaVu/Liberation) without branching.
 */
const FONT_STACK = "Arial Black, Arial, Helvetica, DejaVu Sans, Liberation Sans, sans-serif";

/**
 * Ratios lifted straight from app/icon.svg's 32-unit viewBox so the launcher
 * icon and the favicon are the same mark: rx=8, font-size=11.5, baseline y=20.5.
 */
const RADIUS_RATIO = 8 / 32;
const FONT_RATIO = 11.5 / 32;
const BASELINE_RATIO = 20.5 / 32;

/** Android's maskable safe zone — launchers may crop to the centre 80%. */
const SAFE_ZONE = 0.8;

/**
 * @param maskable full-bleed square background with the mark inset into the
 *   centre 80%. Launchers crop maskable icons to their own shape (circle,
 *   squircle, rounded square), so a rounded background would show cropped
 *   corners and a full-size label would lose its outer edges.
 */
function buildSvg(size: number, maskable: boolean): string {
  const background = maskable
    ? `<rect width="${size}" height="${size}" fill="${BRAND}"/>`
    : `<rect width="${size}" height="${size}" rx="${size * RADIUS_RATIO}" fill="${BRAND}"/>`;

  const label =
    `<text x="${size / 2}" y="${size * BASELINE_RATIO}" font-family="${FONT_STACK}"` +
    ` font-weight="900" font-size="${size * FONT_RATIO}" fill="#ffffff"` +
    ` text-anchor="middle" letter-spacing="${-0.03 * size * FONT_RATIO}">${LABEL}</text>`;

  // Scaling the label group (rather than recomputing the type metrics) keeps the
  // maskable variant provably the same mark, just inset.
  const inset = (size * (1 - SAFE_ZONE)) / 2;
  const body = maskable
    ? `<g transform="translate(${inset},${inset}) scale(${SAFE_ZONE})">${label}</g>`
    : label;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${background}${body}</svg>`;
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

const targets: Array<{ file: string; size: number; maskable: boolean }> = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "maskable-512.png", size: 512, maskable: true },
];

async function main() {
  for (const { file, size, maskable } of targets) {
    const svg = buildSvg(size, maskable);
    const out = join(outDir, file);
    const info = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(out);

    // Guard against the exact silent failure this script exists to avoid: if no
    // font resolved, the label never rendered and we'd ship a blank blue square.
    const { data, info: raw } = await sharp(out)
      .raw()
      .toBuffer({ resolveWithObject: true });
    let white = 0;
    for (let i = 0; i < data.length; i += raw.channels) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      if (r > 200 && g > 200 && b > 200) white++;
    }
    if (white === 0) {
      throw new Error(
        `${file} rendered with no white pixels — the "${LABEL}" label did not draw. ` +
          `No family in FONT_STACK resolved; install one or adjust the stack.`,
      );
    }

    console.log(
      `✓ public/icons/${file} — ${size}px${maskable ? ", maskable" : ""}, ` +
        `${(info.size / 1024).toFixed(1)} KB, ${white} label px`,
    );
  }
}

main().catch((err) => {
  console.error("✗", err instanceof Error ? err.message : err);
  process.exit(1);
});
