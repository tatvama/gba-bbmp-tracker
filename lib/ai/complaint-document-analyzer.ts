import "server-only";
import { generateText, isAiConfigured } from "@/lib/ai/provider";
import type { ComplaintExtraction } from "@/lib/types";
import {
  COMPLAINT_DRAFT_KINDS,
  type ComplaintDraftKind,
  type DraftLanguage,
  type LegalTone,
} from "@/lib/constants";

export type { ComplaintDraftKind };

/**
 * AI analysis of an uploaded complaint document's OCR text. Returns STRUCTURED
 * extraction for the human review screen. Env-gated: with no AI key it returns a
 * "needs manual review" placeholder so the workflow still completes and the user
 * can fill the fields by hand. NEVER applies anything to a complaint directly.
 */

const ANALYZER_SYSTEM = `You analyse scanned civic-complaint documents (BBMP / GBA, Bengaluru) — complaint copies, acknowledgements, department/engineer replies, Action Taken Reports, postal receipts, site notes. The text comes from OCR and may contain errors.

Rules:
1. Use ONLY what is present in the OCR text + provided context. Never invent names, numbers, dates, or actions.
2. If the reply is unclear, set replyGiven to "Reply appears unclear / needs manual review".
3. If no clear action is visible, set actionTaken to "No clear action taken found in document".
4. If dates are uncertain, leave them empty and add a note in summary asking the user to verify.
5. Do not make unsupported allegations.
6. Set confidence to "Low" and needsManualReview to true whenever the OCR text is short, garbled, or ambiguous.
7. Output STRICT JSON only — no prose, no markdown fences.`;

function buildAnalysisPrompt(input: {
  ocrText: string;
  documentType?: string | null;
  complaintContext?: string;
  userNotes?: string;
}): string {
  return `Document type (claimed): ${input.documentType ?? "unknown"}

Complaint context:
${input.complaintContext ?? "(none provided)"}

${input.userNotes ? `User notes: ${input.userNotes}\n` : ""}OCR text:
"""
${input.ocrText.slice(0, 12000)}
"""

Return JSON of EXACTLY this shape (use "" or [] when unknown):
{
  "documentType": "",
  "summary": "",
  "importantDates": [],
  "complaintNumber": "",
  "replyDate": "",
  "actionTakenDate": "",
  "officerNames": [],
  "departmentNames": [],
  "workDescription": "",
  "replyGiven": "",
  "actionTaken": "",
  "pendingIssues": [],
  "suggestedComplaintStatus": "",
  "suggestedNextAction": "",
  "suggestedFollowUpDate": "",
  "recommendedEscalation": "",
  "confidence": "High | Medium | Low",
  "needsManualReview": true
}`;
}

export interface AnalyzeResult {
  ok: boolean;
  extraction: ComplaintExtraction;
  error?: string;
}

/** A safe placeholder extraction used when AI is unavailable or parsing fails. */
function placeholder(summary: string): ComplaintExtraction {
  return {
    documentType: "",
    summary,
    importantDates: [],
    complaintNumber: "",
    replyDate: "",
    actionTakenDate: "",
    officerNames: [],
    departmentNames: [],
    workDescription: "",
    replyGiven: "",
    actionTaken: "",
    pendingIssues: [],
    suggestedComplaintStatus: "",
    suggestedNextAction: "",
    suggestedFollowUpDate: "",
    recommendedEscalation: "",
    confidence: "Low",
    needsManualReview: true,
  };
}

export async function analyzeComplaintDocument(input: {
  ocrText: string;
  documentType?: string | null;
  complaintContext?: string;
  userNotes?: string;
}): Promise<AnalyzeResult> {
  if (!isAiConfigured()) {
    return {
      ok: false,
      error: "AI not configured",
      extraction: placeholder("AI not configured — review the OCR text and fill the fields manually."),
    };
  }
  if (!input.ocrText || input.ocrText.trim().length < 8) {
    return {
      ok: false,
      error: "Not enough OCR text to analyse",
      extraction: placeholder("No usable OCR text — add a summary manually."),
    };
  }

  const r = await generateText({
    system: ANALYZER_SYSTEM,
    prompt: buildAnalysisPrompt(input),
    temperature: 0,
  });
  if (!r.ok || !r.text) {
    return { ok: false, error: r.error ?? "AI request failed", extraction: placeholder("AI request failed — fill fields manually.") };
  }

  const cleaned = r.text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as ComplaintExtraction;
    return { ok: true, extraction: { ...placeholder(""), ...parsed } };
  } catch {
    return {
      ok: false,
      error: "Could not parse AI output",
      extraction: placeholder(r.text.slice(0, 600)),
    };
  }
}

// ── Complaint AI drafts (letters / messages) ────────────────────────────────

const DRAFT_SYSTEM = `You draft civic accountability correspondence for a citizens' team in Bengaluru (BBMP / GBA). Rules: produce an EDITABLE DRAFT only — never state it has been sent. Use only the provided complaint facts; insert [PLACEHOLDERS] for anything missing. Be factual and respectful; phrase concerns as "it appears" / "kindly" unless proof is provided. No unsupported allegations. Output only the draft text.`;

function languageLine(language?: DraftLanguage): string {
  if (language === "Kannada") return "Write the entire draft in formal Kannada (ಕನ್ನಡ).";
  if (language === "Bilingual") return "Write in English, then a formal Kannada (ಕನ್ನಡ) translation below, separated by a line of dashes.";
  return "Write the draft in English.";
}
function toneLine(tone?: LegalTone): string {
  switch (tone) {
    case "Strong": return "Tone: firm and assertive, but factual and respectful.";
    case "Investigative": return "Tone: investigative — probe for specific records and responsibilities.";
    case "Simple": return "Tone: plain, simple language.";
    default: return "Tone: formal and respectful.";
  }
}

export function buildComplaintDraftPrompt(input: {
  kind: ComplaintDraftKind;
  complaintContext: string;
  tone?: LegalTone;
  language?: DraftLanguage;
}): { system: string; prompt: string } {
  const what = COMPLAINT_DRAFT_KINDS[input.kind];
  const CAUTION =
    "CAUTIOUS FRAMING (non-negotiable): every adverse point is a documented suspicion or red flag that calls for records and explanation. NEVER state that any named officer, engineer or contractor committed fraud, theft, forgery or corruption — write 'requires production of records / verification / enquiry'. Build on the chronology and the unanswered points already in the case history; do not invent facts.";
  const extraByKind: Partial<Record<ComplaintDraftKind, string>> = {
    whatsapp: "Keep it concise (a short WhatsApp message), polite, with the case number and the single clear ask.",
    rti_from_complaint:
      "Frame it as a Right to Information Act 2005 application with numbered, specific information requests derived from the complaint history.",
    escalation_letter:
      "Escalate to the NEXT authority in the chain (AE → AEE → EE → Chief Engineer → Commissioner). Open with the case number, summarise the chronology and the time elapsed without an adequate response, list the specific unresolved points, and reserve the right to approach higher forums (Lokayukta, Chief Secretary, Urban Development Department) if records and a reply are not received within a stated period. " +
      CAUTION,
    lokayukta_complaint:
      "Frame as a complaint to the Karnataka Lokayukta. Lay out the chronology, the records relied upon, the public-interest impact, the authorities already approached without adequate response, and the SPECIFIC enquiry sought. " +
      CAUTION,
    chief_secretary_letter:
      "Address to the Chief Secretary / Additional Chief Secretary, Urban Development Department, Government of Karnataka. Summarise the systemic failure to act despite the complaint and follow-ups, give the chronology, and request administrative intervention and a special enquiry. " +
      CAUTION,
    records_preservation:
      "Request that ALL original records (MB books, measurement sheets, QC/quality tests, geo-tagged photographs, the contractor-eligibility set, insurance, and the IFMS / eProc audit logs) be preserved in status-quo pending production, and NOT weeded, altered, or the work completed, while this matter is under examination. Cite the case number and the risk of alteration. " +
      CAUTION,
    counter_reply:
      "Respond POINT-BY-POINT to the department's latest reply in the case history. For each original demand, state whether the reply addressed it; list the specific demands and records that remain UNADDRESSED; demand the specific records named in the forensic findings; and reserve escalation if a complete response is not received within a stated period. " +
      CAUTION,
  };
  const extra = extraByKind[input.kind] ?? "";
  return {
    system: DRAFT_SYSTEM,
    prompt: `Draft: ${what}.

Complaint context:
${input.complaintContext}

${extra}
${toneLine(input.tone)}
${languageLine(input.language)}`,
  };
}
