import "server-only";
import { generateVision, isAiConfigured } from "./provider";

/**
 * Detect distinct ACKNOWLEDGMENT sections inside a single scanned PDF that holds
 * MANY BBMP proof-of-receipt acknowledgments jumbled together (different dates,
 * different complaints, no particular order, variable page counts). VISION-based
 * for the same reason as the complaint-letter detector — scanned stamps and
 * Kannada text OCR poorly, so the page images are authoritative and OCR is only a
 * hint. Env-gated: with AI off it falls back to one section per page (a safe,
 * reviewable default the human can merge on the page-strip).
 *
 * This finds BOUNDARIES + seed identifiers only; rich per-section extraction is
 * done afterwards by analyzeComplaintIntake over each section's OCR text.
 *
 * Mirrors lib/ai/complaint-letter-detector.ts. Callers window inputs > MAX_DETECT_PAGES
 * pages and offset the returned page numbers (see lib/complaints/ack-runner.ts).
 */

export interface DetectedAckSection {
  /** 1-indexed, inclusive (relative to the images passed in). */
  startPage: number;
  /** 1-indexed, inclusive. */
  endPage: number;
  /** What complaint this acknowledgment concerns (subject/matter), if legible. */
  subject: string | null;
  /** The office/authority that issued the acknowledgment. */
  department: string | null;
  /** Any acknowledgment / inward / complaint / token number printed on it. */
  referenceNumber: string | null;
  /** ISO date (YYYY-MM-DD) of receipt, if found. */
  documentDate: string | null;
}

/** Max page images per vision call (cost/latency cap). Runner windows beyond this. */
export const MAX_DETECT_PAGES = 20;

async function getSharp() {
  const s = await import("sharp");
  return s.default || s;
}

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

const DETECTOR_SYSTEM = `You are given the page images of a SINGLE scanned PDF, in order — Image 1 is page 1, Image 2 is page 2, and so on. The PDF is a BULK SCAN of MANY separate ACKNOWLEDGMENTS from a municipal body (BBMP / GBA, Bengaluru). An acknowledgment is PROOF THAT A COMPLAINT/LETTER WAS RECEIVED — e.g. a received/inward stamp with a date, an office seal and a token/inward number, a signed counterfoil, a portal/SMS receipt printout, or a photocopy of the submitted letter bearing a "Received" stamp. They are in NO particular order and each one may span one or more pages.

Your job: find the boundaries between distinct acknowledgments and return one entry per acknowledgment, with its page range and key fields.

Rules:
- An acknowledgment spans one or more CONSECUTIVE pages. Ranges must be contiguous, non-overlapping, in page order, and together cover EVERY page from 1 to the last (no gaps).
- Start a NEW acknowledgment when a new received/inward stamp, a new counterfoil, a new receipt, or a new submitted-letter-with-stamp begins. Continuation pages, attached annexures, and the back side of the same receipt are NOT new acknowledgments — INCLUDE them in the preceding acknowledgment's range.
- If the whole PDF is really ONE acknowledgment, return a SINGLE entry covering all pages.
- The documents are in English and/or Kannada — read both. You may keep Kannada script in the subject.
- The MOST IMPORTANT field is the reference/inward/complaint/token number stamped or written on it — capture it exactly (digits, slashes and all). Do NOT invent values — use null when absent.
- Output STRICT JSON only — no markdown, no commentary outside the JSON:
{
  "sections": [
    {
      "startPage": 1,
      "endPage": 1,
      "subject": "the complaint/matter this acknowledgment concerns, or null",
      "department": "the office/authority that issued/stamped it (e.g. 'Assistant Engineer, BBMP Bommanahalli'), or null",
      "referenceNumber": "the acknowledgment / inward / complaint / token number printed on it, or null",
      "documentDate": "the received date in YYYY-MM-DD, or null"
    }
  ]
}`;

function buildPrompt(ocrText: string, pageCount: number): string {
  const hint = (ocrText || "").trim()
    ? `Supporting OCR text (NOISY — especially for Kannada/stamps; use only as a hint, the images are authoritative). Divided by "--- Page N ---" markers:
"""
${ocrText.slice(0, 12000)}
"""`
    : "(No reliable OCR text — rely on the images.)";

  return `The PDF has ${pageCount} page(s). Each image is the corresponding page, in order.

${hint}

Identify each distinct acknowledgment and return the structured JSON only.`;
}

const clean = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

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

function normalizeRanges(raw: Partial<DetectedAckSection>[], pageCount: number): DetectedAckSection[] {
  const total = Math.max(1, pageCount);
  const out: DetectedAckSection[] = [];
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

/** Recover section objects from a (possibly max_tokens-truncated) JSON response. */
function salvageSections(text: string): Partial<DetectedAckSection>[] {
  const key = text.search(/sections|letters/);
  const start = key >= 0 ? text.indexOf("[", key) : text.indexOf("[");
  if (start < 0) return [];
  const out: Partial<DetectedAckSection>[] = [];
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

/** One section per page — the safe fallback (human merges multi-page acks). */
function perPageFallback(pageCount: number): DetectedAckSection[] {
  const n = Math.max(1, pageCount);
  return Array.from({ length: n }, (_, i) => ({
    startPage: i + 1,
    endPage: i + 1,
    subject: null,
    department: null,
    referenceNumber: null,
    documentDate: null,
  }));
}

export async function detectAckSections(params: {
  pageImages: { buffer: Buffer; mimeType: string }[];
  ocrText: string;
  pageCount: number;
  /** ack-runner.ts calls this once per 20-page window of the same batch —
   *  DETECTOR_SYSTEM is identical across those calls, so it's cacheable. */
  cache?: boolean;
}): Promise<DetectedAckSection[]> {
  const slice = (params.pageImages || []).slice(0, MAX_DETECT_PAGES);
  if (!isAiConfigured() || slice.length === 0) return perPageFallback(params.pageCount);

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
    console.error("[detectAckSections] vision call failed:", res.error);
    return perPageFallback(params.pageCount);
  }

  const cleaned = res.text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  let raw: Partial<DetectedAckSection>[] = [];
  try {
    const parsed = JSON.parse(cleaned) as { sections?: Partial<DetectedAckSection>[] };
    raw = Array.isArray(parsed.sections) ? parsed.sections : [];
  } catch {
    raw = salvageSections(cleaned);
    if (raw.length) console.warn(`[detectAckSections] recovered ${raw.length} sections from truncated JSON`);
    else console.error("[detectAckSections] parse failed; raw head:", cleaned.slice(0, 300));
  }

  const sections = normalizeRanges(raw, params.pageCount);
  return sections.length ? sections : perPageFallback(params.pageCount);
}
