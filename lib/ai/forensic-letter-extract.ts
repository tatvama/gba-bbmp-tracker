import "server-only";
import { extractJson, extractorSystem } from "@/lib/ai/json-extract";
import { isAiConfigured } from "@/lib/ai/provider";
import { normalizeDataset } from "@/lib/forensic/parse-skill-output";
import type { ForensicDataset } from "@/lib/forensic/skill-output";

/**
 * AI fallback for a job folder that has the drafted letter / extracted text but no
 * minimum-dataset JSON. Transcribes the basics (work, contractor, amounts, risk,
 * summary, possible-loss components) from the letter/OCR text into a ForensicDataset
 * so the review screen has something to show and the case can be created. Returns
 * null when AI is not configured or nothing usable is found — caller flags "verify".
 */
export async function deriveDatasetFromLetter(
  jobCode: string,
  letterText: string,
  extractedText: string,
): Promise<ForensicDataset | null> {
  if (!isAiConfigured()) return null;
  const source = [letterText, extractedText].filter(Boolean).join("\n\n---\n\n").slice(0, 24_000);
  if (!source.trim()) return null;

  const system = extractorSystem(
    "Transcribe a BBMP public-works complaint letter / OCR text into a forensic job dataset.",
  );
  const prompt = `Job code: ${jobCode}

From the document below, output STRICT JSON with ONLY these keys (omit any you cannot see):
{
  "work": string,
  "contractor": { "name": string, "class": string },
  "estimate_cost": string,
  "agreement": { "value": string },
  "treasury_loss_total": string,
  "overall_risk": "Green" | "Amber" | "Orange" | "Red" | "Purple",
  "summary": string,
  "misleading_summary": string[],
  "loss_components": [ { "category": string, "amount": number, "confidence": "low"|"medium"|"high", "record": string } ]
}
Transcribe only what is visible; do not compute or invent figures.

DOCUMENT:
${source}`;

  const r = await extractJson<Record<string, unknown>>({ system, prompt, fallback: {}, maxTokens: 2000 });
  if (!r.ok) return null;
  return normalizeDataset(r.data);
}
