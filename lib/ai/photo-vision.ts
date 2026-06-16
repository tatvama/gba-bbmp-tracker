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
