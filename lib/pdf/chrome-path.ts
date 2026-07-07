import { existsSync } from "fs";
import puppeteer, { type Browser } from "puppeteer";

/** Find a Chrome/Chromium executable for Puppeteer.
 *  Priority: PUPPETEER_EXECUTABLE_PATH env var (set in the production Docker image
 *  to /usr/bin/chromium) → common Windows install paths (dev machines) →
 *  return undefined to let Puppeteer fall back to its bundled Chrome.
 *  Shared by the OCR page renderer and the government-letter PDF provider so
 *  both resolve the browser identically in every environment.
 */
export function resolveChromePath(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  if (process.platform !== "win32") return undefined;
  const candidates = [
    process.env.PROGRAMFILES ? `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe` : null,
    process.env["PROGRAMFILES(X86)"] ? `${process.env["PROGRAMFILES(X86)"]}\\Google\\Chrome\\Application\\chrome.exe` : null,
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : null,
    process.env.PROGRAMFILES ? `${process.env.PROGRAMFILES}\\Chromium\\Application\\chrome.exe` : null,
  ];
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return undefined;
}

/**
 * Flags for every headless Chromium launch in this app (letter-PDF generation +
 * the OCR page renderer). Beyond the container basics (--no-sandbox etc., already
 * required for a root/no-userns Docker container), the rest exist specifically to
 * shrink Chromium's memory footprint: this runs on small VPS/Coolify containers
 * where a full-featured launch (GPU process, extensions, background throttling
 * machinery, a zygote pre-fork) can be the difference between launching and
 * getting OOM-killed. None of these affect rendered output — safe defaults for a
 * scripted, single-page, no-GPU-needed render.
 */
const CHROME_LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--font-render-hinting=none",
  "--disable-gpu",
  "--disable-software-rasterizer",
  "--disable-extensions",
  "--disable-background-networking",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--no-zygote",
];

/**
 * Launch headless Chromium with this app's shared path/flags. On a launch
 * failure (the browser process itself never starts — distinct from a page-level
 * error once it's up), rethrows with the likely causes up front: Puppeteer's own
 * message is accurate but generic, and in practice this has always meant either
 * a missing system dependency or — on a small VPS/Coolify container that launches
 * fine locally — the container's memory limit being too tight for Chromium to
 * even start (look for an OOM kill in the host/Docker logs around the same
 * timestamp).
 */
export async function launchBrowser(): Promise<Browser> {
  try {
    return await puppeteer.launch({
      headless: true,
      executablePath: resolveChromePath(),
      args: CHROME_LAUNCH_ARGS,
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Could not launch headless Chromium for PDF rendering: ${detail} — ` +
        "if this happens every time on this server, check the container's memory limit " +
        "(Chromium needs headroom beyond Node's own usage to even start) or confirm all " +
        "required system libraries are installed (see https://pptr.dev/troubleshooting).",
    );
  }
}
