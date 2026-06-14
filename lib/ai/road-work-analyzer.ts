import "server-only";
import { generateText, isAiConfigured } from "@/lib/ai/provider";
import { ROAD_WORK_KNOWLEDGE_TEXT } from "@/lib/ai/road-work-knowledge";

/**
 * AI red-flag audit of a BBMP road-work financial document (bill, MB book,
 * estimate, measurement sheet) from its OCR text, checked against the road-work
 * inspection framework. Returns structured findings for review. Env-gated; never
 * files anything. Findings are AI suspicions, not proof — always human-reviewed.
 */

export interface RoadWorkFinding {
  title: string;
  section: string;
  severity: "High" | "Medium" | "Low";
  detail: string;
  evidence: string;
}

export interface RoadWorkAudit {
  documentType: string;
  summary: string;
  findings: RoadWorkFinding[];
  redFlagCount: number;
  confidence: "High" | "Medium" | "Low";
  needsManualReview: boolean;
}

export interface RoadWorkAuditResult {
  ok: boolean;
  audit: RoadWorkAudit;
  error?: string;
}

const AUDIT_SYSTEM = `You audit BBMP / GBA (Bengaluru) road-work financial documents — bills, Measurement Books (MB), estimates, measurement sheets — for red flags, using the road-work inspection framework below. The text comes from OCR and may contain errors.

Rules:
1. Use ONLY what is in the OCR text. Never invent quantities, amounts, names or dates.
2. Flag a concern only when the text gives a reason to (e.g. an earthwork amount with no royalty/trip-sheet reference, a quantity that doesn't reconcile, a missing test/insurance reference, salvage not deducted, signs of overwriting/fictitious measurement). Map each finding to a framework section.
3. Findings are SUSPICIONS for human review, not proof. Phrase them as "appears", "no reference found to", "could not verify". Never assert fraud.
4. Set confidence "Low" and needsManualReview true when the OCR is short, garbled or ambiguous.
5. Output STRICT JSON only — no prose, no markdown.

${ROAD_WORK_KNOWLEDGE_TEXT}`;

function buildPrompt(ocrText: string, documentType?: string | null): string {
  return `Document type (claimed): ${documentType ?? "unknown (bill / MB book / estimate)"}

OCR text:
"""
${ocrText.slice(0, 12000)}
"""

Identify red flags against the framework. Return JSON of EXACTLY this shape (use [] / "" when nothing found):
{
  "documentType": "",
  "summary": "",
  "findings": [
    { "title": "", "section": "G — MB Book", "severity": "High | Medium | Low", "detail": "", "evidence": "" }
  ],
  "redFlagCount": 0,
  "confidence": "High | Medium | Low",
  "needsManualReview": true
}`;
}

function placeholder(summary: string): RoadWorkAudit {
  return {
    documentType: "",
    summary,
    findings: [],
    redFlagCount: 0,
    confidence: "Low",
    needsManualReview: true,
  };
}

export async function analyzeRoadWorkBill(
  ocrText: string,
  documentType?: string | null,
): Promise<RoadWorkAuditResult> {
  if (!isAiConfigured()) {
    return { ok: false, error: "AI not configured", audit: placeholder("AI not configured — review the OCR text manually.") };
  }
  if (!ocrText || ocrText.trim().length < 8) {
    return { ok: false, error: "Not enough OCR text to audit", audit: placeholder("No usable OCR text.") };
  }

  const r = await generateText({
    system: AUDIT_SYSTEM,
    prompt: buildPrompt(ocrText, documentType),
    temperature: 0,
    maxTokens: 3000,
  });
  if (!r.ok || !r.text) {
    return { ok: false, error: r.error ?? "AI request failed", audit: placeholder("AI request failed.") };
  }

  const cleaned = r.text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as RoadWorkAudit;
    return { ok: true, audit: { ...placeholder(""), ...parsed } };
  } catch {
    return { ok: false, error: "Could not parse AI output", audit: placeholder(r.text.slice(0, 600)) };
  }
}
