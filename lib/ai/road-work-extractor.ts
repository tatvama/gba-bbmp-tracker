import "server-only";
import { generateText, isAiConfigured } from "@/lib/ai/provider";

/**
 * AI extraction of structured facts from a BBMP road-work work order / estimate /
 * agreement (OCR text). Used by the road-work letter generator to prefill the
 * ward, job number, road name and contractor. Env-gated: with no AI key it returns
 * a "needs manual review" placeholder so the user can type the fields by hand.
 * NEVER files or persists anything.
 */

export interface WorkOrderExtraction {
  jobNumber: string;
  wardNumber: string;
  roadName: string;
  contractorName: string;
  workOrderDate: string;
  sanctionedAmount: string;
  agreementNumber: string;
  summary: string;
  confidence: "High" | "Medium" | "Low";
  needsManualReview: boolean;
}

export interface WorkOrderExtractResult {
  ok: boolean;
  extraction: WorkOrderExtraction;
  error?: string;
}

const EXTRACTOR_SYSTEM = `You extract structured facts from BBMP / GBA (Bengaluru) road-work documents — work orders, estimates, agreements, tender notices. The text comes from OCR and may contain errors.

Rules:
1. Use ONLY what is present in the OCR text. Never invent a job number, ward, name, date or amount.
2. Leave a field as "" when it is not clearly present.
3. Set confidence to "Low" and needsManualReview to true when the OCR text is short, garbled or ambiguous.
4. Output STRICT JSON only — no prose, no markdown fences.`;

function buildPrompt(ocrText: string): string {
  return `OCR text from the work-order document:
"""
${ocrText.slice(0, 12000)}
"""

Return JSON of EXACTLY this shape (use "" when unknown):
{
  "jobNumber": "",
  "wardNumber": "",
  "roadName": "",
  "contractorName": "",
  "workOrderDate": "",
  "sanctionedAmount": "",
  "agreementNumber": "",
  "summary": "",
  "confidence": "High | Medium | Low",
  "needsManualReview": true
}`;
}

function placeholder(summary: string): WorkOrderExtraction {
  return {
    jobNumber: "",
    wardNumber: "",
    roadName: "",
    contractorName: "",
    workOrderDate: "",
    sanctionedAmount: "",
    agreementNumber: "",
    summary,
    confidence: "Low",
    needsManualReview: true,
  };
}

export async function extractWorkOrder(ocrText: string): Promise<WorkOrderExtractResult> {
  if (!isAiConfigured()) {
    return {
      ok: false,
      error: "AI not configured",
      extraction: placeholder("AI not configured — type the work details manually."),
    };
  }
  if (!ocrText || ocrText.trim().length < 8) {
    return {
      ok: false,
      error: "Not enough OCR text to analyse",
      extraction: placeholder("No usable OCR text — type the work details manually."),
    };
  }

  const r = await generateText({
    system: EXTRACTOR_SYSTEM,
    prompt: buildPrompt(ocrText),
    temperature: 0,
  });
  if (!r.ok || !r.text) {
    return {
      ok: false,
      error: r.error ?? "AI request failed",
      extraction: placeholder("AI request failed — type the work details manually."),
    };
  }

  const cleaned = r.text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as WorkOrderExtraction;
    return { ok: true, extraction: { ...placeholder(""), ...parsed } };
  } catch {
    return { ok: false, error: "Could not parse AI output", extraction: placeholder(r.text.slice(0, 600)) };
  }
}
