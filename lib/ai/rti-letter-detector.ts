import "server-only";
import { generateVision, isAiConfigured } from "./provider";
import { RTI_CATEGORIES } from "@/lib/constants";
import type { DetectedLetter } from "@/lib/rti/letter-import";

/**
 * Detect distinct RTI letters inside a SINGLE merged PDF (an "office copy" bundle
 * that may concatenate several separately-filed RTIs). VISION-based: the rendered
 * page images are sent to Claude (the way rti-document-summarizer already works),
 * with OCR text passed only as a hint — scanned Kannada/handwritten office copies
 * OCR poorly, so relying on OCR text alone misses the boundaries and the fields.
 * Env-gated: when AI is unavailable it falls back to a single all-pages letter.
 */

/** How many page images to send to the detection call (cost/latency cap). */
const MAX_DETECT_PAGES = 24;

// Dynamically import sharp (native addon; mirrors lib/pdf/merge.ts).
async function getSharp() {
  const s = await import("sharp");
  return s.default || s;
}

/**
 * Downscale a high-DPI rendered page to a vision-friendly size. The renderer
 * emits ~216 DPI JPEGs; sending a stack of those can blow the API's per-image /
 * request size limits and make the call fail. Claude only needs enough detail to
 * read headers and see layout for boundary detection.
 */
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

const DETECTOR_SYSTEM = `You are given the page images of a SINGLE scanned PDF, in order — Image 1 is page 1, Image 2 is page 2, and so on. The PDF is an "office copy" that may contain SEVERAL separate RTI (Right to Information) letters/applications. Each letter is a self-contained request — typically a fresh "To, The Public Information Officer …" addressee block, a "Subject:" line, body, and signature/date — and each usually begins on a new page.

Your job: find the boundaries between distinct letters and return one entry per letter, with its page range and key fields.

Rules:
- A letter spans one or more CONSECUTIVE pages. Ranges must be contiguous, non-overlapping, in page order, and together cover every page from 1 to the last.
- Start a NEW letter whenever a new addressee/"To, The PIO …" block or a new "Subject:" appears at the top of a page — that signals a separate application.
- If the whole PDF is really just ONE letter, return a single entry covering all pages.
- The documents are in English and/or Kannada — read both. Transcribe Kannada subjects/PIO into readable text (you may keep Kannada script).
- Do NOT invent values — use null when a field is genuinely absent.
- Output STRICT JSON only — no markdown, no commentary outside the JSON:
{
  "letters": [
    {
      "startPage": 1,
      "endPage": 2,
      "subject": "the subject / title / matter this letter concerns — usually the 'Subject:' / 'Sub:' / 'ವಿಷಯ:' line, or null",
      "authority": "public authority / department / office addressed, or null",
      "category": "one of: Public works | Road work | Drain work | Garbage | Streetlight | Building plan | Bill payment | Contractor details | MB Book | Work order | Tender | Estimate | Measurement | Quality control | Ward committee | Public health | Revenue | Other, or null",
      "referenceNumber": "any application / diary / reference number on this letter, or null",
      "pioName": "name of the Public Information Officer (PIO) addressed/named on this letter, or null",
      "pioDesignation": "designation/office of the PIO from the addressee block (e.g. 'Executive Engineer, BBMP Hebbal'), or null",
      "documentDate": "main date on this letter in YYYY-MM-DD, or null"
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

Identify each distinct RTI letter and return the structured JSON only.`;
}

const clean = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

const CATEGORY_SET = new Set<string>(RTI_CATEGORIES as readonly string[]);

/** Keep only a real RTI category; the model sometimes returns its own labels. */
function cleanCategory(v: unknown): string | null {
  const c = clean(v);
  return c && CATEGORY_SET.has(c) ? c : null;
}

/** Normalise a printed date to ISO YYYY-MM-DD (Indian DD/MM/YYYY assumed), else null. */
function parseIsoDate(v: unknown): string | null {
  const s = clean(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // already ISO
  let m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/); // D/M/YYYY
  if (m && m[1] && m[2] && m[3]) {
    const d = m[1].padStart(2, "0"), mo = m[2].padStart(2, "0"), y = m[3];
    if (+mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31) return `${y}-${mo}-${d}`;
  }
  m = s.match(/^(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})$/); // YYYY/M/D
  if (m && m[1] && m[2] && m[3]) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return null;
}

/** Clamp/sort the AI ranges into safe, in-order, 1..pageCount entries. */
function normalizeRanges(raw: Partial<DetectedLetter>[], pageCount: number): DetectedLetter[] {
  const total = Math.max(1, pageCount);
  const out: DetectedLetter[] = [];
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
      authority: clean(r.authority),
      category: cleanCategory(r.category),
      referenceNumber: clean(r.referenceNumber),
      pioName: clean(r.pioName),
      pioDesignation: clean(r.pioDesignation),
      documentDate: parseIsoDate(r.documentDate),
    });
  }
  out.sort((a, b) => a.startPage - b.startPage || a.endPage - b.endPage);
  return out;
}

export async function detectRtiLetters(params: {
  pageImages: { buffer: Buffer; mimeType: string }[];
  ocrText: string;
  pageCount: number;
}): Promise<DetectedLetter[]> {
  const fallback = (): DetectedLetter[] => [
    {
      startPage: 1,
      endPage: Math.max(1, params.pageCount),
      subject: null,
      authority: null,
      category: null,
      referenceNumber: null,
      pioName: null,
      pioDesignation: null,
      documentDate: null,
    },
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
    maxTokens: 3000,
  });
  if (!res.ok || !res.text) {
    console.error("[detectRtiLetters] vision call failed:", res.error);
    return fallback();
  }

  try {
    const cleaned = res.text
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned) as { letters?: Partial<DetectedLetter>[] };
    const letters = normalizeRanges(
      Array.isArray(parsed.letters) ? parsed.letters : [],
      params.pageCount,
    );
    return letters.length ? letters : fallback();
  } catch (e) {
    console.error("[detectRtiLetters] parse failed", e, "raw:", res.text?.slice(0, 500));
    return fallback();
  }
}
