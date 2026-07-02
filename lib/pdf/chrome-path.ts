import { existsSync } from "fs";

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
