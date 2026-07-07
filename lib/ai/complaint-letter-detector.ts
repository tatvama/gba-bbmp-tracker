import "server-only";
import { generateVision, isAiConfigured } from "./provider";

/**
 * Detect distinct COMPLAINT letters inside a SINGLE uploaded PDF (a citizen may
 * scan several separate complaint letters into one file). VISION-based: the
 * rendered page images are sent to Claude, with OCR text passed only as a hint —
 * scanned Kannada/handwritten letters OCR poorly, so relying on OCR text alone
 * misses the boundaries. Env-gated: when AI is unavailable it falls back to a
 * single all-pages complaint, preserving today's single-complaint behaviour.
 *
 * Mirrors lib/ai/rti-letter-detector.ts (the proven RTI multi-letter detector).
 */

/** One complaint letter detected inside a multi-letter PDF (page-range + fields). */
export interface DetectedComplaintLetter {
  /** 1-indexed, inclusive. */
  startPage: number;
  /** 1-indexed, inclusive. */
  endPage: number;
  subject: string | null;
  department: string | null;
  referenceNumber: string | null;
  /** ISO date (YYYY-MM-DD) printed on the letter, if found. */
  documentDate: string | null;
}

/** How many page images to send to the detection call (cost/latency cap). */
const MAX_DETECT_PAGES = 24;

async function getSharp() {
  const s = await import("sharp");
  return s.default || s;
}

/** Downscale a high-DPI rendered page to a vision-friendly size (keeps request
 *  under the API's per-image / per-request limits). */
async function downscaleForVision(buf: Buffer): Promise<{ buffer: Buffer; mimeType: string }> {
  try {
    const sharp = await getSharp();
    const out = await sharp(buf)
      .resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 72 })
      .toBuffer();
    return { buffer: out, mimeType: "image/jpeg" };
  } catch {
    return { buffer: buf, mimeType: "image/jpeg" };
  }
}

const DETECTOR_SYSTEM = `You are given the page images of a SINGLE scanned PDF, in order — Image 1 is page 1, Image 2 is page 2, and so on. The PDF may contain SEVERAL separate CITIZEN COMPLAINT letters addressed to a municipal body (BBMP / GBA, Bengaluru). Each complaint letter is a self-contained grievance — typically a fresh addressee block ("To, The Executive Engineer / Assistant Engineer / Commissioner …"), a "Subject:" / "Sub:" / "ವಿಷಯ:" line, the complainant's details, a body describing the issue, a date, and a signature.

Your job: find the boundaries between distinct complaint letters and return one entry per letter, with its page range and key fields.

Rules:
- A letter spans one or more CONSECUTIVE pages. Ranges must be contiguous, non-overlapping, in page order, and together cover EVERY page from 1 to the last (no gaps).
- Start a NEW letter only when a genuinely new complaint begins — a new addressee/"To …" block AND/OR a new "Subject:" at the top of a page, with a distinct grievance.
- SUPPORTING PAGES (annexures, photographs, receipts, maps, ID copies, continuation pages of the same letter, department reports attached to a letter) are NOT new complaints — INCLUDE them in the page range of the complaint letter they belong to (normally the immediately preceding letter). Do NOT create a separate entry for them.
- If the whole PDF is really just ONE complaint (with or without supporting pages), return a SINGLE entry covering all pages.
- The documents are in English and/or Kannada — read both. Transcribe Kannada subjects into readable text (you may keep Kannada script).
- Do NOT invent values — use null when a field is genuinely absent.
- Output STRICT JSON only — no markdown, no commentary outside the JSON:
{
  "letters": [
    {
      "startPage": 1,
      "endPage": 2,
      "subject": "the subject / matter this complaint concerns — usually the 'Subject:' / 'Sub:' / 'ವಿಷಯ:' line, or null",
      "department": "the department / office / officer addressed (e.g. 'Executive Engineer, BBMP Bommanahalli'), or null",
      "referenceNumber": "any complaint / inward / reference number on this letter, or null",
      "documentDate": "the main date on this letter in YYYY-MM-DD, or null"
    }
  ]
}`;

function buildPrompt(ocrText: string, pageCount: number): string {
  const hint = (ocrText || "").trim()
    ? `Supporting OCR text (NOISY — especially for Kannada/handwriting; use only as a hint, the images are authoritative). It is divided by "--- Page N ---" markers:
"""
${ocrText.slice(0, 12000)}
"""`
    : "(No reliable OCR text — rely on the images.)";

  return `The PDF has ${pageCount} page(s). Each image is the corresponding page, in order.

${hint}

Identify each distinct complaint letter and return the structured JSON only.`;
}

const clean = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Normalise a printed date to ISO YYYY-MM-DD (Indian DD/MM/YYYY assumed), else null. */
function parseIsoDate(v: unknown): string | null {
  const s = clean(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (m && m[1] && m[2] && m[3]) {
    const d = m[1].padStart(2, "0"), mo = m[2].padStart(2, "0"), y = m[3];
    if (+mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31) return `${y}-${mo}-${d}`;
  }
  m = s.match(/^(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})$/);
  if (m && m[1] && m[2] && m[3]) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return null;
}

/** Clamp/sort the AI ranges into safe, in-order, 1..pageCount entries. */
function normalizeRanges(raw: Partial<DetectedComplaintLetter>[], pageCount: number): DetectedComplaintLetter[] {
  const total = Math.max(1, pageCount);
  const out: DetectedComplaintLetter[] = [];
  for (const r of raw) {
    let s = Math.round(Number(r.startPage));
    let e = Math.round(Number(r.endPage));
    if (!Number.isFinite(s)) s = 1;
    if (!Number.isFinite(e)) e = s;
    s = Math.min(Math.max(1, s), total);
    e = Math.min(Math.max(s, e), total);
    out.push({
      startPage: s,
      endPage: e,
      subject: clean(r.subject),
      department: clean(r.department),
      referenceNumber: clean(r.referenceNumber),
      documentDate: parseIsoDate(r.documentDate),
    });
  }
  out.sort((a, b) => a.startPage - b.startPage || a.endPage - b.endPage);
  return out;
}

/**
 * Recover complete letter objects from a (possibly truncated) JSON response —
 * walks the `letters` array and parses each balanced {...} block, discarding an
 * incomplete trailing object. Lets a response cut off by max_tokens still yield
 * every letter that did come through.
 */
function salvageLetters(text: string): Partial<DetectedComplaintLetter>[] {
  const key = text.indexOf("letters");
  const start = key >= 0 ? text.indexOf("[", key) : text.indexOf("[");
  if (start < 0) return [];
  const out: Partial<DetectedComplaintLetter>[] = [];
  let depth = 0, buf = "", inStr = false, esc = false;
  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i] as string;
    if (esc) { buf += ch; esc = false; continue; }
    if (ch === "\\") { buf += ch; esc = true; continue; }
    if (ch === '"') inStr = !inStr;
    if (!inStr && ch === "]" && depth === 0) break;
    if (!inStr && ch === "{") { if (depth === 0) buf = ""; depth++; }
    if (depth > 0) buf += ch;
    if (!inStr && ch === "}") {
      depth--;
      if (depth === 0) {
        try { out.push(JSON.parse(buf)); } catch { /* skip malformed */ }
        buf = "";
      }
    }
  }
  return out;
}

export async function detectComplaintLetters(params: {
  pageImages: { buffer: Buffer; mimeType: string }[];
  ocrText: string;
  pageCount: number;
  /** DETECTOR_SYSTEM is identical across every import, so a retry of this same
   *  upload (or a future caller that re-runs detection) can reuse the cache. */
  cache?: boolean;
}): Promise<DetectedComplaintLetter[]> {
  const fallback = (): DetectedComplaintLetter[] => [
    { startPage: 1, endPage: Math.max(1, params.pageCount), subject: null, department: null, referenceNumber: null, documentDate: null },
  ];

  const slice = (params.pageImages || []).slice(0, MAX_DETECT_PAGES);
  if (!isAiConfigured() || slice.length === 0) return fallback();

  const downscaled = await Promise.all(slice.map((p) => downscaleForVision(p.buffer)));
  const images = downscaled.map((d) => ({ mediaType: d.mimeType, dataBase64: d.buffer.toString("base64") }));

  const res = await generateVision({
    system: DETECTOR_SYSTEM,
    prompt: buildPrompt(params.ocrText, params.pageCount),
    images,
    temperature: 0,
    maxTokens: 8000,
    cache: params.cache ? { system: true } : undefined,
  });
  if (!res.ok || !res.text) {
    console.error("[detectComplaintLetters] vision call failed:", res.error);
    return fallback();
  }

  const cleaned = res.text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

  let rawLetters: Partial<DetectedComplaintLetter>[] = [];
  try {
    const parsed = JSON.parse(cleaned) as { letters?: Partial<DetectedComplaintLetter>[] };
    rawLetters = Array.isArray(parsed.letters) ? parsed.letters : [];
  } catch {
    rawLetters = salvageLetters(cleaned);
    if (rawLetters.length) {
      console.warn(`[detectComplaintLetters] recovered ${rawLetters.length} letters from truncated JSON`);
    } else {
      console.error("[detectComplaintLetters] parse failed; raw head:", cleaned.slice(0, 300));
    }
  }

  const letters = normalizeRanges(rawLetters, params.pageCount);
  return letters.length ? letters : fallback();
}
