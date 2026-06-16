import "server-only";
import { generateText, isAiConfigured } from "@/lib/ai/provider";
import type { StructuredBill } from "@/lib/forensics/types";

/**
 * Extracts a BBMP/PWD bill's OCR text into a STRUCTURED bill (line items with
 * qty/rate/amount, taxes, deductions, totals) so the deterministic rule engine
 * can recompute it exactly. AI does extraction only — never arithmetic judgement.
 * Env-gated; returns an empty bill + needsManualReview when unavailable.
 */

const SYSTEM = `You transcribe Indian government civil-works bills / Measurement-Book abstracts (BBMP / PWD, Bengaluru) from OCR text into structured JSON. You only TRANSCRIBE numbers you can see — never compute, correct, or invent them. If a number is unclear, use null. Output STRICT JSON only.`;

function prompt(ocrText: string): string {
  return `OCR text of the bill:
"""
${ocrText.slice(0, 14000)}
"""

Transcribe into JSON of EXACTLY this shape (numbers as numbers, null when unclear; do NOT compute anything):
{
  "billType": "",
  "billNo": "",
  "billDate": "",
  "workOrderRef": "",
  "sanctionedAmount": null,
  "contractor": "",
  "lineItems": [{ "slNo": "", "description": "", "unit": "", "qty": null, "rate": null, "amount": null, "srCode": "" }],
  "taxes": [{ "name": "GST", "pct": null, "amount": null }],
  "deductions": [{ "name": "", "amount": null }],
  "subTotal": null,
  "grandTotal": null,
  "netPayable": null,
  "recoveriesPresent": [],
  "confidence": "High | Medium | Low",
  "needsManualReview": false
}`;
}

function empty(needsReview: boolean): StructuredBill {
  return { lineItems: [], taxes: [], deductions: [], recoveriesPresent: [], confidence: "Low", needsManualReview: needsReview };
}

export interface BillExtractResult {
  ok: boolean;
  bill: StructuredBill;
  error?: string;
}

export async function extractBillStructure(ocrText: string): Promise<BillExtractResult> {
  if (!isAiConfigured()) return { ok: false, error: "AI not configured", bill: empty(true) };
  if (!ocrText || ocrText.trim().length < 12) return { ok: false, error: "Not enough OCR text", bill: empty(true) };

  const r = await generateText({ system: SYSTEM, prompt: prompt(ocrText), temperature: 0, maxTokens: 4000 });
  if (!r.ok || !r.text) return { ok: false, error: r.error ?? "AI request failed", bill: empty(true) };

  const cleaned = r.text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as StructuredBill;
    return {
      ok: true,
      bill: {
        ...empty(false),
        ...parsed,
        lineItems: Array.isArray(parsed.lineItems) ? parsed.lineItems : [],
        taxes: Array.isArray(parsed.taxes) ? parsed.taxes : [],
        deductions: Array.isArray(parsed.deductions) ? parsed.deductions : [],
      },
    };
  } catch {
    return { ok: false, error: "Could not parse bill structure", bill: empty(true) };
  }
}
