import "server-only";
import { generateText, isAiConfigured } from "@/lib/ai/provider";
import { ROAD_WORK_KNOWLEDGE_TEXT } from "@/lib/ai/road-work-knowledge";

/**
 * Cross-document bill/MB forensics. Given the OCR text of a case's financial
 * documents (bill, MB book, work order, estimate, trip sheet), AI checks
 * arithmetic, cross-document quantity/amount consistency, rate plausibility, and
 * missing references (royalty/insurance/test reports) against the road-work
 * framework. Cautious + evidence-based — suspicions for review, never accusations.
 */

export interface ForensicCrossCheck {
  check: string;
  status: "ok" | "mismatch" | "cannot_verify";
  detail: string;
}
export interface ForensicFinding {
  title: string;
  category: string;
  severity: "High" | "Medium" | "Low";
  detail: string;
  evidence: string;
}
export interface BillForensics {
  summary: string;
  crossChecks: ForensicCrossCheck[];
  findings: ForensicFinding[];
  redFlagCount: number;
  confidence: "High" | "Medium" | "Low";
  needsManualReview: boolean;
}
export interface BillForensicsResult {
  ok: boolean;
  forensics: BillForensics;
  error?: string;
}

const SYSTEM = `You are a forensic auditor of BBMP / GBA (Bengaluru) road-work financial documents. You are given the OCR text of several documents for ONE work (bill, Measurement Book, work order, estimate, trip sheet). Cross-check them against each other and the framework below.

Do:
1. Recompute arithmetic where numbers are present (quantity × rate = amount; sums).
2. Cross-check that quantities/amounts reconcile across documents (e.g. MB qty vs bill qty vs work-order/estimate qty; trip-sheet earthwork vs MB earthwork).
3. Flag missing references the framework requires (royalty/DMG challan, insurance, test reports, salvage deduction, geo-tag photos).
4. Note rate plausibility only if the document itself gives a basis; never invent a Schedule-of-Rates figure.

Rules: use ONLY the OCR text. Never invent numbers. Phrase concerns as "appears"/"could not verify". Findings are suspicions for human review, not proof. OCR may be imperfect — set cannot_verify when unsure. Output STRICT JSON only.

${ROAD_WORK_KNOWLEDGE_TEXT}`;

function placeholder(summary: string): BillForensics {
  return { summary, crossChecks: [], findings: [], redFlagCount: 0, confidence: "Low", needsManualReview: true };
}

export async function analyzeBillForensics(input: {
  documents: { type: string; ocrText: string }[];
  context?: string;
}): Promise<BillForensicsResult> {
  if (!isAiConfigured()) {
    return { ok: false, error: "AI not configured", forensics: placeholder("AI not configured — review the documents manually.") };
  }
  const docs = input.documents.filter((d) => d.ocrText && d.ocrText.trim().length > 8);
  if (docs.length === 0) {
    return { ok: false, error: "No OCR text available", forensics: placeholder("No usable OCR text on this case's documents. Run OCR first.") };
  }

  const docBlocks = docs
    .map((d, i) => `--- DOCUMENT ${i + 1} (${d.type}) ---\n${d.ocrText.slice(0, 6000)}`)
    .join("\n\n");

  const prompt = `Case context: ${input.context ?? "(none)"}

${docBlocks}

Return JSON of EXACTLY this shape (use [] / "" when nothing found):
{
  "summary": "",
  "crossChecks": [{ "check": "MB qty vs bill qty", "status": "ok | mismatch | cannot_verify", "detail": "" }],
  "findings": [{ "title": "", "category": "Arithmetic | Quantity mismatch | Rate | Missing record | Other", "severity": "High | Medium | Low", "detail": "", "evidence": "" }],
  "redFlagCount": 0,
  "confidence": "High | Medium | Low",
  "needsManualReview": true
}`;

  const r = await generateText({ system: SYSTEM, prompt, temperature: 0, maxTokens: 3500 });
  if (!r.ok || !r.text) {
    return { ok: false, error: r.error ?? "AI request failed", forensics: placeholder("AI request failed — review manually.") };
  }
  const cleaned = r.text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as BillForensics;
    return { ok: true, forensics: { ...placeholder(""), ...parsed } };
  } catch {
    return { ok: false, error: "Could not parse AI output", forensics: placeholder(r.text.slice(0, 600)) };
  }
}
