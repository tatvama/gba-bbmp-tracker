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
 * shrink Chromium's resource footprint: this runs on small VPS/Coolify containers
 * where a full multi-process launch (separate GPU/renderer/zygote processes, each
 * with their own address space) can be the difference between launching and
 * getting killed — by the OOM killer if memory is the binding constraint, or by a
 * container PID/process-count limit or a seccomp policy blocking a syscall one of
 * those child processes needs. --single-process collapses the whole browser into
 * ONE OS process, which sidesteps both failure modes at once (there's no separate
 * process left to be denied). Real tradeoff, so it's here rather than assumed
 * elsewhere: single-process Chromium is less crash-isolated (a bad page can take
 * the whole browser down) and Chromium upstream doesn't fully support it anymore —
 * acceptable here because every render is one script-controlled PDF/HTML page, not
 * arbitrary browsing. None of these flags change rendered output.
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
  "--disable-crash-reporter",
  "--disable-breakpad",
  "--no-zygote",
  "--single-process",
];

/**
 * Launch headless Chromium with this app's shared path/flags. On a launch
 * failure (the browser process itself never starts — distinct from a page-level
 * error once it's up), rethrows with the likely causes up front: Puppeteer's own
 * message is accurate but generic. If Chromium's own startup log lines (D-Bus,
 * crashpad) appear in the error before it dies, the binary itself is fine — it's
 * being killed partway through launch, which on a small VPS/Coolify container
 * almost always means the container's memory (or occasionally process-count)
 * limit is too tight; check the host for an OOM-kill entry at the same timestamp
 * (`dmesg | grep -i "out of memory"` or the container runtime's own logs).
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
        "if this happens every time on this server and Chromium's own startup log lines " +
        "(dbus/crashpad) appear above, the binary is running but being killed partway " +
        "through launch — check the container's memory limit and the host for an OOM-kill " +
        `entry at this timestamp. Otherwise confirm all required system libraries are ` +
        "installed (see https://pptr.dev/troubleshooting).",
    );
  }
}
