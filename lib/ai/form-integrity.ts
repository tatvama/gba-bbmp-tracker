import "server-only";
import { generateVision, isAiConfigured } from "@/lib/ai/provider";

/**
 * Vision form-integrity screen. Claude LOOKS at a document image and returns
 * BOOLEAN red-flag observations only — it never concludes forgery. Every flag it
 * raises is treated downstream as grade-D + needsManualReview (mb-integrity), and
 * worded as "requires original / metadata / expert verification".
 */
export interface FormIntegrityFlags {
  blank_signed: boolean;
  overwriting_without_initials: boolean;
  identical_signature_image: boolean;
  scan_patch: boolean;
  words_vs_figures_mismatch: boolean;
  missing_signature: boolean;
  notes: string;
  needsManualReview: boolean;
}

const EMPTY: FormIntegrityFlags = {
  blank_signed: false, overwriting_without_initials: false, identical_signature_image: false,
  scan_patch: false, words_vs_figures_mismatch: false, missing_signature: false,
  notes: "", needsManualReview: true,
};

const SYSTEM = `You visually screen a scanned government document for integrity RED FLAGS only. You CANNOT and MUST NOT conclude forgery from an image — you only note observable anomalies that warrant production of the original record and expert verification. Report booleans only. Output STRICT JSON, no prose.`;

const VISION_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function analyzeDocFormIntegrity(
  buffer: Buffer,
  mime: string | null,
): Promise<{ ok: boolean; flags: FormIntegrityFlags; error?: string }> {
  if (!isAiConfigured()) return { ok: false, error: "AI not configured", flags: EMPTY };
  if (!mime || !VISION_MIMES.includes(mime)) return { ok: false, error: "Not a supported image", flags: EMPTY };

  const r = await generateVision({
    system: SYSTEM,
    prompt: `Screen this document image. Return JSON exactly:
{
  "blank_signed": false,                 // signature present but critical fields blank
  "overwriting_without_initials": false, // corrected value with no initials
  "identical_signature_image": false,    // a signature that looks like a pasted identical image
  "scan_patch": false,                   // white box / patch / pasted-looking region
  "words_vs_figures_mismatch": false,    // amount in words differs from figures
  "missing_signature": false,            // expected signature/seal absent
  "notes": "",                           // one short neutral observation
  "needsManualReview": true
}`,
    images: [{ mediaType: mime, dataBase64: buffer.toString("base64") }],
    maxTokens: 800,
  });
  if (!r.ok || !r.text) return { ok: false, error: r.error ?? "Vision request failed", flags: EMPTY };
  const cleaned = r.text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as Partial<FormIntegrityFlags>;
    return { ok: true, flags: { ...EMPTY, ...parsed, needsManualReview: true } };
  } catch {
    return { ok: false, error: "Could not parse vision output", flags: EMPTY };
  }
}
