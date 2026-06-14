/**
 * Prompt builders for AI-assisted drafting. Pure (no network) — each returns a
 * { system, prompt } pair for lib/ai/provider.generateText. The safety rules are
 * baked into the system prompt for every draft (spec §2 AI safety rules).
 */
import type { DraftLanguage, LegalTone } from "@/lib/constants";

/** Shared safety rules applied to every generated draft. */
export const RTI_SYSTEM_PROMPT = `You are an expert assistant that drafts Right to Information (RTI) Act 2005 applications, appeals, and civic accountability correspondence for a citizens' team in Bengaluru, India (BBMP / GBA — Greater Bengaluru Authority).

Strict rules:
1. Produce an EDITABLE DRAFT only. Never state or imply the document has been filed or sent.
2. Use ONLY the facts provided. Do not invent names, dates, numbers, work codes, or amounts.
3. For any missing fact, insert a clearly bracketed [PLACEHOLDER] (e.g. [DATE OF WORK], [WARD NUMBER]) instead of guessing.
4. Do NOT make unsupported allegations. Unless documentary proof is explicitly provided, phrase concerns as "it appears that…", "kindly provide the records pertaining to…", or "please clarify…".
5. Cite the provided source records or reference numbers where available.
6. Be specific and itemise information requests as a numbered list when drafting an RTI application.
7. Use clear, respectful, legally appropriate language. Do not threaten.
8. End the body with "Yours faithfully," followed by [APPLICANT NAME] and [DATE] placeholders unless those are provided.
9. Output ONLY the draft text — no commentary, no explanation, no markdown code fences.`;

function toneLine(tone?: LegalTone): string {
  switch (tone) {
    case "Strong":
      return "Tone: firm and assertive, while remaining factual and respectful.";
    case "Investigative":
      return "Tone: investigative — probe for specific records, responsibilities, and timelines.";
    case "Formal":
      return "Tone: formal and procedural.";
    case "Simple":
      return "Tone: plain, simple language a non-lawyer can understand.";
    default:
      return "Tone: formal and respectful.";
  }
}

function languageLine(language?: DraftLanguage): string {
  switch (language) {
    case "Kannada":
      return "Write the entire draft in formal Kannada (ಕನ್ನಡ).";
    case "Bilingual":
      return "Write the draft in English first, then provide a formal Kannada (ಕನ್ನಡ) translation below it, separated by a line of dashes.";
    default:
      return "Write the draft in English.";
  }
}

export interface RtiDraftInput {
  subject: string;
  facts?: string | null;
  category?: string | null;
  questions?: string[];
  wardName?: string | null;
  divisionName?: string | null;
  officerName?: string | null;
  publicAuthority?: string | null;
  pioName?: string | null;
  pioDesignation?: string | null;
  applicantName?: string | null;
  tone?: LegalTone;
  language?: DraftLanguage;
  sourceRefs?: string[];
}

export function buildRtiApplicationPrompt(input: RtiDraftInput): {
  system: string;
  prompt: string;
} {
  const lines: string[] = [
    "Draft a complete RTI application under the Right to Information Act, 2005.",
    "",
    `Subject: ${input.subject}`,
    input.category ? `Category: ${input.category}` : "",
    input.publicAuthority ? `Public authority: ${input.publicAuthority}` : "",
    input.pioName || input.pioDesignation
      ? `Addressed to PIO: ${[input.pioName, input.pioDesignation].filter(Boolean).join(", ")}`
      : "Addressed to: The Public Information Officer, [PUBLIC AUTHORITY]",
    input.wardName ? `Ward: ${input.wardName}` : "",
    input.divisionName ? `Division: ${input.divisionName}` : "",
    input.officerName ? `Responsible officer on record: ${input.officerName}` : "",
    input.applicantName ? `Applicant: ${input.applicantName}` : "",
    "",
    input.facts ? `Background facts provided by the applicant:\n${input.facts}` : "",
    "",
    input.questions && input.questions.length
      ? `Specific information to request (turn each into a precise, numbered RTI query):\n${input.questions
          .map((q, i) => `${i + 1}. ${q}`)
          .join("\n")}`
      : "Frame precise, numbered information requests appropriate to the subject above.",
    input.sourceRefs && input.sourceRefs.length
      ? `\nInternal source references to cite where relevant: ${input.sourceRefs.join("; ")}`
      : "",
    "",
    "Also include a line stating the applicant is willing to pay the prescribed fee, and a request for the information in [PHYSICAL COPY / EMAIL] form.",
    toneLine(input.tone),
    languageLine(input.language),
  ].filter(Boolean);

  return { system: RTI_SYSTEM_PROMPT, prompt: lines.join("\n") };
}

export interface FirstAppealInput {
  subject: string;
  rtiRef?: string | null;
  dateFiled?: string | null;
  replySummary?: string | null;
  grounds: string[];
  faaName?: string | null;
  tone?: LegalTone;
  language?: DraftLanguage;
}

export function buildFirstAppealPrompt(input: FirstAppealInput): {
  system: string;
  prompt: string;
} {
  const lines: string[] = [
    "Draft a FIRST APPEAL under Section 19(1) of the Right to Information Act, 2005, addressed to the First Appellate Authority (FAA).",
    "",
    input.faaName ? `First Appellate Authority: ${input.faaName}` : "Addressed to: The First Appellate Authority, [PUBLIC AUTHORITY]",
    `Original RTI subject: ${input.subject}`,
    input.rtiRef ? `Original RTI reference: ${input.rtiRef}` : "Original RTI reference: [RTI REFERENCE NO.]",
    input.dateFiled ? `Original RTI filed on: ${input.dateFiled}` : "Original RTI filed on: [DATE]",
    "",
    input.replySummary
      ? `Summary of the PIO's reply (or lack thereof):\n${input.replySummary}`
      : "The PIO's reply (or absence of reply): [DESCRIBE]",
    "",
    `Grounds of appeal (expand each into a clear, numbered legal ground):\n${
      input.grounds.length
        ? input.grounds.map((g, i) => `${i + 1}. ${g}`).join("\n")
        : "[STATE GROUNDS]"
    }`,
    "",
    "Request the FAA to direct the PIO to provide the complete information, and to take action under the Act for the deficiency.",
    toneLine(input.tone),
    languageLine(input.language),
  ].filter(Boolean);

  return { system: RTI_SYSTEM_PROMPT, prompt: lines.join("\n") };
}

export interface SecondAppealInput {
  subject: string;
  rtiRef?: string | null;
  firstAppealSummary?: string | null;
  reasons: string[];
  commissionName?: string | null;
  tone?: LegalTone;
  language?: DraftLanguage;
}

export function buildSecondAppealPrompt(input: SecondAppealInput): {
  system: string;
  prompt: string;
} {
  const lines: string[] = [
    "Draft a SECOND APPEAL under Section 19(3) of the Right to Information Act, 2005, addressed to the Karnataka Information Commission.",
    "",
    input.commissionName
      ? `Commission: ${input.commissionName}`
      : "Addressed to: The Karnataka Information Commission, Bengaluru",
    `Original RTI subject: ${input.subject}`,
    input.rtiRef ? `Original RTI reference: ${input.rtiRef}` : "Original RTI reference: [RTI REFERENCE NO.]",
    "",
    input.firstAppealSummary
      ? `First appeal outcome / FAA order:\n${input.firstAppealSummary}`
      : "First appeal outcome / FAA order: [DESCRIBE — including whether no order was passed]",
    "",
    `Reasons for the second appeal (expand each into a clear, numbered ground):\n${
      input.reasons.length
        ? input.reasons.map((r, i) => `${i + 1}. ${r}`).join("\n")
        : "[STATE REASONS]"
    }`,
    "",
    "Where requested in the reasons, include a prayer for penalty under Section 20 and/or compensation under Section 19(8)(b), and a direction to disclose the information.",
    toneLine(input.tone),
    languageLine(input.language),
  ].filter(Boolean);

  return { system: RTI_SYSTEM_PROMPT, prompt: lines.join("\n") };
}

/** Re-shape an existing draft per a one-click transformation (panel buttons). */
export function buildTransformPrompt(currentDraft: string, instruction: string): {
  system: string;
  prompt: string;
} {
  return {
    system: RTI_SYSTEM_PROMPT,
    prompt: `Revise the following draft as instructed, keeping all factual content and [PLACEHOLDERS] intact. Instruction: ${instruction}\n\n--- DRAFT ---\n${currentDraft}`,
  };
}

export interface ReplyAnalysisInput {
  questions: string[];
  replyText: string;
}

/** Reply analyzer: returns a system+prompt asking for STRICT JSON we can parse. */
export function buildReplyAnalysisPrompt(input: ReplyAnalysisInput): {
  system: string;
  prompt: string;
} {
  const system = `You analyse Public Information Officer (PIO) replies to RTI applications. You are precise and conservative: if a question is not clearly and fully answered, do not mark it "Answered". Output STRICT JSON only — no prose, no markdown.`;

  const prompt = `Original RTI questions:
${input.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

PIO reply text:
"""
${input.replyText}
"""

For each original question, return an object with:
- "question": the original question text
- "replyExtract": the relevant snippet of the reply (or "" if none)
- "status": one of "Answered" | "Partially answered" | "Not answered" | "Denied" | "Irrelevant" | "Needs clarification"
- "appealGround": a short suggested first-appeal ground if the answer is deficient, else ""
- "notes": a brief note

Also assess overall: was the reply delayed, was an exemption section cited, was extra fee demanded, and is a first appeal recommended.

Return JSON of exactly this shape:
{"items":[{"question":"","replyExtract":"","status":"","appealGround":"","notes":""}],"overall":{"complete":false,"exemptionCited":false,"extraFeeDemanded":false,"delayed":false,"firstAppealRecommended":false,"summary":""}}`;

  return { system, prompt };
}
