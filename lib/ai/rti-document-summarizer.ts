import "server-only";
import { generateVision } from "./provider";
import { generateInformationSummary } from "@/lib/utils/summary-generator";

/**
 * Summarise an uploaded RTI document (request, acknowledgement, reply, order…)
 * and extract a few useful fields. Unlike the old acknowledgement analyzer this
 * does NOT verify the document — it just produces a plain-language summary plus
 * structured fields for display and for seeding the filing date. Env-gated: when
 * AI is not configured it falls back to the offline heuristic summariser.
 */

export interface RtiDocumentSummary {
  summary: string;
  documentType: string;
  authority: string | null;
  subject: string | null;
  referenceNumber: string | null;
  /** ISO date (YYYY-MM-DD) printed on the document, if found. */
  documentDate: string | null;
  keyDates: { label: string; date: string }[];
}

const MAX_AI_PAGES = 5;

const SUMMARIZER_SYSTEM = `You read scanned or photographed RTI (Right to Information) documents from India — application copies, filing acknowledgements/receipts, PIO replies, and appellate orders.

Produce a short, factual summary and pull out a few key fields. Do NOT verify authenticity, do NOT judge the document, and do NOT invent values — use null when something is not present.

Output STRICT JSON only — no markdown, no commentary outside the JSON:
{
  "summary": "2-3 plain-English sentences: what this document is and the gist of its content.",
  "documentType": "Application | Acknowledgement | Reply | FAA Order | Second Appeal Order | Other",
  "authority": "public authority / department / office named on the document, or null",
  "subject": "the matter the document concerns, or null",
  "referenceNumber": "any application / acknowledgement / diary number printed on it, or null",
  "documentDate": "the main date on the document in YYYY-MM-DD, or null",
  "keyDates": [ { "label": "what the date is", "date": "YYYY-MM-DD" } ]
}`;

function buildPrompt(
  ocrText: string,
  rti: { subject?: string | null; internalRef?: string | null; publicAuthority?: string | null },
): string {
  const ctx: string[] = [];
  if (rti.internalRef) ctx.push(`- Internal reference: "${rti.internalRef}"`);
  if (rti.subject) ctx.push(`- RTI subject: "${rti.subject}"`);
  if (rti.publicAuthority) ctx.push(`- Public authority: "${rti.publicAuthority}"`);

  return `RTI case context (for your understanding only — do not copy blindly):
${ctx.length ? ctx.join("\n") : "- (none provided)"}

OCR-extracted text from the document:
"""
${(ocrText || "").slice(0, 15000)}
"""

Summarise the document and return the structured JSON only.`;
}

/** Offline fallback built from the OCR text when AI is unavailable. */
function fallbackSummary(ocrText: string): RtiDocumentSummary {
  const s = generateInformationSummary(ocrText);
  return {
    summary: s.summaryText,
    documentType: "Other",
    authority: null,
    subject: s.title && s.title !== "No document available." ? s.title : null,
    referenceNumber: null,
    documentDate: null,
    keyDates: [],
  };
}

export async function summarizeRtiDocument(params: {
  images: { buffer: Buffer; mimeType: string }[];
  ocrText: string;
  rti: { subject?: string | null; internalRef?: string | null; publicAuthority?: string | null };
}): Promise<RtiDocumentSummary> {
  const images = params.images.slice(0, MAX_AI_PAGES).map((img) => ({
    mediaType: img.mimeType,
    dataBase64: img.buffer.toString("base64"),
  }));

  const result = await generateVision({
    system: SUMMARIZER_SYSTEM,
    prompt: buildPrompt(params.ocrText, params.rti),
    images,
    temperature: 0,
  });

  if (!result.ok || !result.text) {
    return fallbackSummary(params.ocrText);
  }

  try {
    const cleaned = result.text
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned) as Partial<RtiDocumentSummary>;
    const keyDates = Array.isArray(parsed.keyDates)
      ? parsed.keyDates.filter((d) => d && typeof d.date === "string")
      : [];
    return {
      summary: parsed.summary?.trim() || fallbackSummary(params.ocrText).summary,
      documentType: parsed.documentType || "Other",
      authority: parsed.authority?.trim() || null,
      subject: parsed.subject?.trim() || null,
      referenceNumber: parsed.referenceNumber?.trim() || null,
      documentDate: parsed.documentDate?.trim() || null,
      keyDates,
    };
  } catch (e) {
    console.error("[summarizeRtiDocument] parse failed", e);
    return fallbackSummary(params.ocrText);
  }
}
