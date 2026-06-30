import "server-only";
import { generateVision, isAiConfigured } from "@/lib/ai/provider";

/**
 * Vision-AI verification of an uploaded site photo. Claude *looks* at the image
 * and assesses: is it a genuine on-site work photo (vs a screenshot / stock /
 * internet image / document scan)? Does it appear to show the claimed work? Any
 * signs of editing? Cautious + evidence-based — describes what is visible and
 * raises concerns, never asserts fraud. Env-gated; never throws.
 */

export interface PhotoVision {
  imageKind: "real_site_photo" | "document_scan" | "screenshot" | "stock_or_internet" | "unclear";
  showsClaimedWork: "yes" | "partial" | "no" | "unclear";
  description: string;
  concerns: string[];
  tamperSigns: string[];
  verdict: "ok" | "suspect" | "mismatch" | "not_site_photo";
  confidence: "High" | "Medium" | "Low";
  needsManualReview: boolean;
}

export interface PhotoVisionResult {
  ok: boolean;
  vision: PhotoVision;
  error?: string;
}

const VISION_SYSTEM = `You verify photographs submitted as proof of completed BBMP / GBA (Bengaluru) civic works (roads, drains, footpaths). You are cautious and evidence-based: describe only what is visible and raise concerns as possibilities — never assert fraud or accuse anyone.

Assess:
1. imageKind — is this a genuine on-site photograph, a scan of a document, a screenshot (of an app/portal/another photo), or an apparent stock/internet image?
2. showsClaimedWork — does the visible content plausibly match the claimed work?
3. tamperSigns — visible signs of editing/morphing (pasted text/timestamps, mismatched lighting, cloned regions, watermarks of other sources). List only what you can actually see.
4. verdict — "ok" (genuine, matches), "suspect" (genuine but concerns), "mismatch" (doesn't match the claimed work), "not_site_photo" (screenshot/stock/scan where a site photo was expected).

Output STRICT JSON only — no prose, no markdown.`;

function placeholder(description: string): PhotoVision {
  return {
    imageKind: "unclear",
    showsClaimedWork: "unclear",
    description,
    concerns: [],
    tamperSigns: [],
    verdict: "ok",
    confidence: "Low",
    needsManualReview: true,
  };
}

const VISION_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function analyzePhotoVision(
  buffer: Buffer,
  mime: string | null,
  context: string,
): Promise<PhotoVisionResult> {
  if (!isAiConfigured()) {
    return { ok: false, error: "AI not configured", vision: placeholder("AI not configured — review the photo manually.") };
  }
  if (!mime || !VISION_MIMES.includes(mime)) {
    return { ok: false, error: "Not a vision-supported image", vision: placeholder("Vision check supports JPG/PNG/WebP/GIF only.") };
  }

  const prompt = `Claimed work context:
${context || "(none provided)"}

Return JSON of EXACTLY this shape:
{
  "imageKind": "real_site_photo | document_scan | screenshot | stock_or_internet | unclear",
  "showsClaimedWork": "yes | partial | no | unclear",
  "description": "one-line description of what is visible",
  "concerns": [],
  "tamperSigns": [],
  "verdict": "ok | suspect | mismatch | not_site_photo",
  "confidence": "High | Medium | Low",
  "needsManualReview": false
}`;

  const r = await generateVision({
    system: VISION_SYSTEM,
    prompt,
    images: [{ mediaType: mime, dataBase64: buffer.toString("base64") }],
    maxTokens: 1200,
  });
  if (!r.ok || !r.text) {
    return { ok: false, error: r.error ?? "Vision request failed", vision: placeholder("Vision request failed — review manually.") };
  }

  const cleaned = r.text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as PhotoVision;
    return { ok: true, vision: { ...placeholder(""), ...parsed } };
  } catch {
    return { ok: false, error: "Could not parse vision output", vision: placeholder(r.text.slice(0, 400)) };
  }
}

// ── Cross-job duplicate-photo matching (Part D — visual, robust to print→scan) ──

/** A content descriptor for shortlisting candidate same-photo pairs cheaply. */
export interface PhotoDescriptor {
  sceneType: string;
  setting: string;
  fixedObjects: string[];
  distinctiveFeatures: string[];
  visibleTextOrSignage: string[];
  oneLinePhrase: string;
}

const DESCRIBE_SYSTEM = `You describe a photograph of a BBMP/GBA civic work site so two photos can later be compared for being the SAME photograph (even after one is printed and re-scanned). Focus on FIXED, distinctive content: structures, road/drain geometry, buildings, signage/text, fixed objects, vegetation — NOT lighting, colour balance, or sharpness. Output STRICT JSON only.`;

/** Build a content descriptor for one photo (stored on the document for shortlisting). */
export async function describePhotoForMatching(
  buffer: Buffer,
  mime: string | null,
): Promise<PhotoDescriptor | null> {
  if (!isAiConfigured() || !mime || !VISION_MIMES.includes(mime)) return null;
  const prompt = `Return JSON of EXACTLY this shape:
{
  "sceneType": "road | drain | footpath | building | open-ground | other",
  "setting": "one short phrase locating the scene",
  "fixedObjects": ["distinctive fixed objects visible"],
  "distinctiveFeatures": ["specific, unusual, identifying details"],
  "visibleTextOrSignage": ["any readable text / board / number"],
  "oneLinePhrase": "a single normalized sentence summarizing the scene"
}`;
  const r = await generateVision({
    system: DESCRIBE_SYSTEM,
    prompt,
    images: [{ mediaType: mime, dataBase64: buffer.toString("base64") }],
    maxTokens: 700,
  });
  if (!r.ok || !r.text) return null;
  const cleaned = r.text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned) as PhotoDescriptor;
  } catch {
    return null;
  }
}

export interface PhotoCompareResult {
  verdict: "same" | "different" | "unclear";
  confidence: "High" | "Medium" | "Low";
  sharedDetails: string;
}

const COMPARE_SYSTEM = `You compare TWO photographs to decide whether they are the SAME photograph (same physical scene at the same moment) — even if one is a printout that was scanned or re-photographed, cropped, rotated, or recompressed. Judge by fixed scene content, structures, signage and geometry — NOT colour, exposure, or sharpness. If the scene is generic (e.g. a bare road) and you cannot point to SPECIFIC shared details, answer "unclear". Output STRICT JSON only.`;

/** Compare two candidate photos for being the same underlying photograph. */
export async function compareTwoPhotos(
  a: { buffer: Buffer; mime: string },
  b: { buffer: Buffer; mime: string },
): Promise<PhotoCompareResult | null> {
  if (!isAiConfigured()) return null;
  if (!VISION_MIMES.includes(a.mime) || !VISION_MIMES.includes(b.mime)) return null;
  const prompt = `Image 1 and Image 2 are provided. Are they the SAME photograph? Return JSON of EXACTLY this shape:
{ "verdict": "same | different | unclear", "confidence": "High | Medium | Low", "sharedDetails": "the specific shared (or differing) details you based this on" }`;
  const r = await generateVision({
    system: COMPARE_SYSTEM,
    prompt,
    images: [
      { mediaType: a.mime, dataBase64: a.buffer.toString("base64") },
      { mediaType: b.mime, dataBase64: b.buffer.toString("base64") },
    ],
    maxTokens: 600,
  });
  if (!r.ok || !r.text) return null;
  const cleaned = r.text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned) as PhotoCompareResult;
  } catch {
    return null;
  }
}
