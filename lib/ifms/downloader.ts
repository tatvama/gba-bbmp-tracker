/**
 * BBMP IFMS work-order document downloader (TypeScript port of bbmp_downloader.py).
 *
 * The portal (https://account.bbmpgov.in/vsswb/) is PUBLIC — no login. It is driven
 * by a single PHP endpoint, vss00CvStatusData.php, discriminated by a `pAction`
 * query param. PDFs are served from a static path. The TLS cert is a government NIC
 * cert, so every request goes through an https.Agent with rejectUnauthorized=false
 * (per-request — NEVER the global NODE_TLS_REJECT_UNAUTHORIZED flag).
 *
 * NOTE: deliberately NO `import "server-only"` — this module is pure Node (node:https
 * + node:http) so its parsing helpers can be unit-tested under vitest, exactly like
 * lib/ocr/image-fingerprint.ts. It holds no secrets.
 *
 * The portal is reachable only from Indian networks; callers should surface a clear
 * "cannot reach portal" message (see checkPortalReachable) when it is not.
 */
import https from "node:https";
import http from "node:http";
import { URL } from "node:url";

// ── Portal constants (pinned to the studied portal; one-file edit if it drifts) ──
export const PORTAL_BASE = "https://account.bbmpgov.in";
export const PORTAL_API = `${PORTAL_BASE}/vsswb/vss00CvStatusData.php`;
export const PORTAL_FILES = `${PORTAL_BASE}/vssIFMS/Files`; // + <raddl>/<rFileName>
const PORTAL_REFERER = `${PORTAL_BASE}/vsswb/`;

const JOB_CODE_RE = /\d{3}-\d{2}-\d{6}/;
const MID_ID_RE = /--\d+-/g; // the "--14976594-" middle id segment to collapse
// Reserved Windows filename punctuation. Spaces and hyphens are intentionally kept
// (they are legal and common in portal names, e.g. "WO-1-Estimate PN.pdf").
const WIN_ILLEGAL_RE = /[<>:"/\\|?*]/g;

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/javascript, */*; q=0.01",
  "X-Requested-With": "XMLHttpRequest",
  Referer: PORTAL_REFERER,
  Origin: PORTAL_BASE,
};

// Reused keep-alive agent that skips the NIC cert check. Per-request, not global.
const insecureAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// =============================================================================
// Pure helpers (no network — unit-tested)
// =============================================================================

/** First job code (ddd-yy-nnnnnn) found anywhere in a string, or null. */
export function extractJobCode(value: unknown): string | null {
  if (value == null) return null;
  const m = String(value).match(JOB_CODE_RE);
  return m ? m[0] : null;
}

/**
 * Normalise loose ward/year[/serial] input into a canonical target.
 *   "44-22" / "044-22" / "44 2022" / "ward 44 year 2022" -> "044-22"
 *   "044-22-000011" / "44 2022 11"                        -> "044-22-000011"
 * Returns null if it can't find at least a ward and a year.
 */
export function normalizeTarget(text: unknown): string | null {
  if (text == null) return null;
  const nums = String(text).match(/\d+/g);
  if (!nums || nums.length < 2) return null;
  const [wardRaw, yrRaw, serialRaw] = nums;
  const ward = (wardRaw ?? "").padStart(3, "0").slice(-3); // 44 -> 044
  const yr = yrRaw ?? "";
  const year = yr.length >= 2 ? yr.slice(-2) : yr.padStart(2, "0"); // 2022 -> 22
  if (serialRaw) return `${ward}-${year}-${serialRaw.padStart(6, "0")}`;
  return `${ward}-${year}`;
}

/** A canonical full job code? (ddd-yy-nnnnnn) */
export function isFullCode(target: string): boolean {
  return /^\d{3}-\d{2}-\d{6}$/.test(target);
}
/** A canonical ward+year prefix? (ddd-yy) */
export function isWardYear(target: string): boolean {
  return /^\d{3}-\d{2}$/.test(target);
}

/** Collapse the '--<digits>-' middle id: 'WO-1--14976594-Estimate.pdf' -> 'WO-1-Estimate.pdf'. */
export function cleanFilename(name: string | null | undefined): string {
  if (!name) return name ?? "";
  const base = String(name).split(/[\\/]/).pop() || String(name);
  return base.replace(MID_ID_RE, "-");
}

/** Strip characters illegal in Windows filenames; keep spaces, hyphens, extension. */
export function sanitizeFilename(name: string): string {
  let cleaned = String(name).replace(WIN_ILLEGAL_RE, "");
  cleaned = cleaned.trim().replace(/^\.+|\.+$/g, ""); // no leading/trailing dots
  return cleaned || "file";
}

/** Percent-encode a path segment the way Python's urllib.quote(safe="/") does. */
function quotePathSegment(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

/** Minimal HTML-entity decode for portal description strings. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Strip HTML tags + collapse whitespace (portal wodetails/job fields carry markup). */
export function stripHtml(value: unknown): string {
  if (value == null) return "";
  const text = decodeEntities(String(value).replace(/<[^>]+>/g, " "));
  return text.replace(/\s+/g, " ").trim();
}

/** Parse a portal amount ("4,78,170.00" / "Rs 12,345") to a number, or null. */
export function parseAmount(value: unknown): number | null {
  if (value == null) return null;
  const cleaned = String(value).replace(/[^\d.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export interface PortalFileEntry {
  rFileName?: string;
  filename?: string;
  fileName?: string;
  FileName?: string;
  name?: string;
  raddl?: string | number;
  rFileType?: string;
  [k: string]: unknown;
}

export interface PortalFile {
  name: string;
  url: string;
  docType: string;
  isBlankTemplate: boolean;
}

/** From a LoadWBFiles entry, build { name, url } or null. */
export function fileInfo(entry: PortalFileEntry | string): { name: string; url: string } | null {
  let name: string | undefined;
  let raddl = "";
  if (typeof entry === "string") {
    name = entry;
  } else if (entry && typeof entry === "object") {
    name = entry.rFileName || entry.filename || entry.fileName || entry.FileName || entry.name;
    raddl = entry.raddl != null ? String(entry.raddl) : "";
  } else {
    return null;
  }
  if (!name) return null;
  const url = `${PORTAL_FILES}${raddl}/${quotePathSegment(String(name))}`;
  return { name: String(name), url };
}

/**
 * Map a portal filename to a canonical complaint document type. The returned
 * strings are chosen so the job-audit classifiers in lib/actions/job-audit.ts
 * (isBill/isMb/isTender/isInsurance/isRoyalty) fire correctly AND so they belong
 * to COMPLAINT_DOCUMENT_TYPES. Order matters (more specific first).
 */
export function mapPortalFileToDocType(filename: string): string {
  const f = (filename || "").toLowerCase();
  // Content keywords first. The WO-/WB- number prefix is UNRELIABLE across jobs —
  // a single real job filed Schedule B as both WO-4 and WO-5 — so never key off it.
  if (/wb-?mb\b|mbbook|measurement|\bmb\b/.test(f)) return "MB Book copy";
  if (/sched|sch[e]?[-\s]?b\b/.test(f)) return "Schedule B"; // "Schedule B" / "SCHE B" / "SCH-B" / "SCHB"
  if (/wb-?bill\b|partbill|gstinv|\bbill\b/.test(f)) return "Bill copy";
  if (/estimate|\best\b/.test(f)) return "Estimate copy";
  if (/kw-?4|agree/.test(f)) return "KW-4 agreement"; // "AGREE" / "Agreement" / "KW-4"
  if (/insurance|policy/.test(f)) return "Insurance policy";
  if (/financial.?bid/.test(f)) return "Financial bid";
  if (/tech.?eval|technical.?bid|\beval\b|notif/.test(f)) return "Technical bid";
  if (/tender|\bnit\b/.test(f)) return "Tender notice";
  if (/registration|licen[cs]e|enlist/.test(f)) return "Contractor registration certificate";
  if (/\bdts\b|technical.?sanction|\bts\b/.test(f)) return "Technical Sanction";
  if (/royalty|mineral|\bdmg\b|challan/.test(f)) return "Royalty challan";
  if (/trip.?sheet|weighbridge|weigh/.test(f)) return "Trip sheet / weighbridge";
  if (/\bqc\b|quality|cube.?test|test.?report/.test(f)) return "Quality test report";
  if (/completion|\bcc\b/.test(f)) return "Completion certificate";
  if (/c&d|salvage|dumping|disposal/.test(f)) return "C&D waste / dumping-yard / salvage register";
  if (/photo|image|\bgeo\b/.test(f)) return "Geo-tagged site photo";
  if (/work.?order/.test(f)) return "Work order copy";
  return "Other evidence";
}

/** A filename containing BLANK is an empty template (presence is an integrity flag). */
export function isBlankTemplate(filename: string): boolean {
  return /blank/i.test(filename || "");
}

/** True if a payload looks like an HTML login/redirect page (expired/blocked session). */
export function looksLikeLoginHtml(payload: unknown): boolean {
  if (Array.isArray(payload) || (payload && typeof payload === "object")) return false;
  if (typeof payload !== "string") return true;
  const snippet = payload.slice(0, 2000).toLowerCase();
  return snippet.includes("<html") || snippet.includes("<!doctype") || snippet.includes("login") || snippet.includes("sign in");
}

// =============================================================================
// Low-level HTTP (node:https with per-request TLS-off agent)
// =============================================================================

interface RawResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

function httpGetRaw(
  urlStr: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number; redirects?: number } = {},
): Promise<RawResponse> {
  const { headers = BROWSER_HEADERS, timeoutMs = 90_000, redirects = 3 } = opts;
  return new Promise<RawResponse>((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(urlStr);
    } catch (e) {
      reject(e);
      return;
    }
    const lib = url.protocol === "http:" ? http : https;
    const req = lib.request(
      url,
      {
        method: "GET",
        headers,
        agent: url.protocol === "https:" ? insecureAgent : undefined,
        timeout: timeoutMs,
      },
      (res) => {
        const status = res.statusCode || 0;
        const location = res.headers.location;
        if ([301, 302, 303, 307, 308].includes(status) && location && redirects > 0) {
          res.resume(); // drain
          const next = new URL(location, url).toString();
          resolve(httpGetRaw(next, { headers, timeoutMs, redirects: redirects - 1 }));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) }));
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error(`Request timed out after ${timeoutMs}ms`)));
    req.end();
  });
}

// =============================================================================
// API calls
// =============================================================================

/** GET the PHP endpoint with query params; parse JSON, fall back to raw text. */
export async function apiGet(params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams(params).toString();
  const { status, body } = await httpGetRaw(`${PORTAL_API}?${qs}`);
  if (status >= 400) throw new Error(`Portal returned HTTP ${status}`);
  const text = body.toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export interface PortalBill {
  wbid: string | number;
  job?: string; // job code + description (code mode)
  wodetails?: string; // WO / CBR / RTGS string (code mode)
  [k: string]: unknown;
}

/** Bill Status search: a full job code -> its bill(s). Missing job -> []. */
export async function getJobBills(jobCode: string): Promise<PortalBill[]> {
  const payload = await apiGet({ pAction: "LoadTypeCombo", pJobNumber: jobCode, pSelection: "1" });
  if (Array.isArray(payload)) {
    return payload.filter(
      (e): e is PortalBill => !!e && typeof e === "object" && "wbid" in e && (e as PortalBill).wbid != null,
    );
  }
  return [];
}

/** Files attached to one work-bill / WO id. */
export async function getWoFiles(workBillId: string | number): Promise<PortalFileEntry[]> {
  const payload = await apiGet({ pAction: "LoadWBFiles", pWorkBillID: String(workBillId) });
  return Array.isArray(payload) ? (payload as PortalFileEntry[]) : [];
}

/** Date-mode job list (paid bills in a date window). Optional; ward+year is primary. */
export async function fetchJobsByDate(dateFrom: string, dateTo: string): Promise<Record<string, unknown>[]> {
  const payload = await apiGet({
    pAction: "LoadPaymentGridData",
    pDateFrom: dateFrom,
    pDateTo: dateTo,
    pBudgetHeadID: "-1",
    pWardIDs: "",
    pDDOID: "-1",
    pDDOIDs: "",
  });
  return Array.isArray(payload) ? (payload as Record<string, unknown>[]) : [];
}

export interface JobFiles {
  jobCode: string;
  exists: boolean;
  files: PortalFile[];
  meta: { description: string; woRef: string; billIds: string };
}

/** Resolve a full job code to its de-duplicated file list + light metadata. */
export async function getJobFiles(jobCode: string): Promise<JobFiles> {
  const bills = await getJobBills(jobCode);
  if (!bills.length) {
    return { jobCode, exists: false, files: [], meta: { description: "", woRef: "", billIds: "" } };
  }
  const seen = new Set<string>();
  const files: PortalFile[] = [];
  for (const bill of bills) {
    const entries = await getWoFiles(bill.wbid);
    for (const e of entries) {
      const fi = fileInfo(e);
      if (!fi) continue;
      const local = sanitizeFilename(cleanFilename(fi.name));
      if (seen.has(local)) continue;
      seen.add(local);
      files.push({
        name: fi.name,
        url: fi.url,
        docType: mapPortalFileToDocType(fi.name),
        isBlankTemplate: isBlankTemplate(fi.name),
      });
    }
  }
  const first = bills[0];
  return {
    jobCode,
    exists: true,
    files,
    meta: {
      description: stripHtml(first?.job),
      woRef: stripHtml(first?.wodetails),
      billIds: bills.map((b) => String(b.wbid)).join(", "),
    },
  };
}

// =============================================================================
// Downloading
// =============================================================================

export class DownloadError extends Error {}

/**
 * Download one file. Rejects HTML error/login pages and (for .pdf) non-PDF bodies,
 * mirroring the Python guard. Retries transient network errors up to `retries`×.
 */
export async function downloadFile(url: string, opts: { expectPdf?: boolean; retries?: number } = {}): Promise<Buffer> {
  const { expectPdf = url.toLowerCase().endsWith(".pdf"), retries = 3 } = opts;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { status, headers, body } = await httpGetRaw(url, { timeoutMs: 120_000 });
      if (status >= 400) throw new Error(`HTTP ${status}`);
      const contentType = String(headers["content-type"] || "").toLowerCase();
      const head = body.subarray(0, 15).toString("latin1").trimStart().toLowerCase();
      if (contentType.includes("text/html") || head.startsWith("<!doctype") || head.startsWith("<html")) {
        throw new DownloadError("server returned HTML, not a document");
      }
      if (expectPdf && !body.subarray(0, 5).toString("latin1").startsWith("%PDF")) {
        throw new DownloadError("response is not a valid PDF (missing %PDF header)");
      }
      return body;
    } catch (e) {
      if (e instanceof DownloadError) throw e; // content problem; retry won't help
      lastErr = e;
      if (attempt < retries) await sleep(2000 * attempt); // 2s, 4s linear backoff
    }
  }
  throw new DownloadError(
    `network error after ${retries} attempts: ${lastErr instanceof Error ? lastErr.message : lastErr}`,
  );
}

/** One real API call to confirm the portal is reachable from this network. */
export async function checkPortalReachable(): Promise<{ ok: boolean; error?: string }> {
  try {
    // A non-existent job returns `false`/[] — reaching the endpoint at all is success.
    await apiGet({ pAction: "LoadTypeCombo", pJobNumber: "000-00-000000", pSelection: "1" });
    return { ok: true };
  } catch {
    return {
      ok: false,
      error:
        "Could not reach the BBMP IFMS portal. It is restricted to Indian networks — run this on a machine/connection where https://account.bbmpgov.in/vsswb/ opens in a browser, and not behind a blocking VPN/proxy.",
    };
  }
}

export interface ResolvedTarget {
  kind: "code" | "wardyear";
  value: string; // ddd-yy-nnnnnn or ddd-yy
}

/** Normalise a list of loose target strings into canonical code / ward+year targets. */
export function resolveTargets(rawTargets: string[]): { targets: ResolvedTarget[]; invalid: string[] } {
  const targets: ResolvedTarget[] = [];
  const invalid: string[] = [];
  for (const raw of rawTargets) {
    if (!raw || !String(raw).trim()) continue;
    const norm = normalizeTarget(raw);
    if (norm && isFullCode(norm)) targets.push({ kind: "code", value: norm });
    else if (norm && isWardYear(norm)) targets.push({ kind: "wardyear", value: norm });
    else invalid.push(String(raw).trim());
  }
  return { targets, invalid };
}

/**
 * Expand a ward+year prefix into the job codes that actually exist, by walking serials
 * 000001.. until `stopAfterMisses` consecutive missing serials (tolerates gaps) or
 * `maxSerial`. `onProbe` is called after each serial for progress.
 */
export async function expandWardYear(
  wardYear: string,
  opts: { maxSerial?: number; stopAfterMisses?: number; onProbe?: (serial: number, hit: boolean) => void } = {},
): Promise<string[]> {
  const { maxSerial = 2000, stopAfterMisses = 30, onProbe } = opts;
  const found: string[] = [];
  let misses = 0;
  for (let serial = 1; serial <= maxSerial; serial++) {
    const jobCode = `${wardYear}-${String(serial).padStart(6, "0")}`;
    const bills = await getJobBills(jobCode);
    const hit = bills.length > 0;
    onProbe?.(serial, hit);
    if (!hit) {
      misses++;
      if (misses >= stopAfterMisses) break;
      continue;
    }
    misses = 0;
    found.push(jobCode);
  }
  return found;
}
