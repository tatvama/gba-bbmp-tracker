import "server-only";
import { generateText, isAiConfigured, type PromptSegment } from "@/lib/ai/provider";
import type { ComplaintExtraction } from "@/lib/types";
import { DRAFT_STRUCTURE_BLOCK, INVESTIGATOR_PERSONA } from "@/lib/intelligence/prompts";
import {
  COMPLAINT_DRAFT_KINDS,
  COMPLAINT_STATUSES,
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
7. For suggestedComplaintStatus, when the document is the department/engineer's response, bifurcate carefully between "Reply Received" and "Action Taken Report Received": use "Action Taken Report Received" ONLY if the document itself states specific corrective work was actually CARRIED OUT (e.g. repair completed, site visited, contractor deployed, drain/garbage cleared) — not merely promised, scheduled, or "under process". Use "Reply Received" for any other written response, explanation or update, even a reassuring one. If the document reads as both, or you cannot tell which applies, set confidence to "Low" and needsManualReview to true so a human decides.
8. Output STRICT JSON only — no prose, no markdown fences.`;

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
}

"suggestedComplaintStatus" must be EXACTLY one of these strings, or "" if none fit: ${COMPLAINT_STATUSES.join(", ")}`;
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

const DRAFT_SYSTEM = `You draft civic-accountability correspondence for a citizens' team in Bengaluru (BBMP / GBA) — a complete, ready-to-print letter on a plain sheet.

HARD RULES:
- Produce a COMPLETE, ready-to-send letter. It stays an editable draft for human review — never claim it has been sent.
- Use ONLY the facts in the context below. If a specific detail (an address line, a date, a name) is NOT provided, simply OMIT that line. NEVER output a bracketed placeholder such as [NAME], [DATE], [ADDRESS] or [OFFICE ADDRESS PLACEHOLDER], and never invent facts.
- Use the exact From block, To block, Date, case number, job number, contractor, ward and sub-division EXACTLY as given in the context. Do not replace any provided value with a placeholder.
- Structure it as a proper formal letter: place the TO (recipient) block verbatim at the very top of the letter, followed by the Date, a bold Subject line, salutation, a numbered body that draws on the case chronology, the specific requests, and place the closing and the FROM (sender / signatory) block verbatim at the very bottom (in the signature block). Do NOT place the FROM address at the top of the letter.
- Format with Markdown so it renders cleanly: '## ' for the few section headings, '**bold**' for the subject and labels, numbered / bulleted lists for points and requests, and GitHub-flavoured Markdown tables (pipe syntax with a '| --- |' separator row of plain hyphens) for any itemised data such as the insurance coverage table. Do NOT wrap the whole letter in a code block.
- Never use dash punctuation (–, —, or a hyphen used to join two clauses) inside a sentence. Write complete sentences, or split into separate sentences, or use a comma instead. Reference numbers, case/job codes and markdown bullet markers are unaffected by this rule.
- Be factual and respectful. Phrase every concern as "it appears" / "the records do not show" / "kindly verify / produce"; never as an accusation.
- When the context includes an "APPLICABLE LEGAL FRAMEWORK" block, you may cite ONLY the Acts, Rules, Bye-laws and Sections listed there (plus any specifically named in the case history). Prefer the High-priority items and include a Medium item only where the facts of this complaint actually support it. Integrate them naturally into the relevant part of the letter, use the suggested wording as a guide, and explain the authority's obligation or power in plain professional language rather than quoting the statute. NEVER invent or cite any Act, Rule, Section, Bye-law, Notification, Circular, Government Order or case that is not provided.
Output ONLY the letter text in Markdown — no preamble, no explanation.`;

/**
 * Legal notice = a Public Interest Litigation letter petition to the Hon'ble
 * Chief Justice, High Court of Karnataka. This is a DIFFERENT shape from the
 * department demand letter (DRAFT_STRUCTURE_BLOCK): the petitioner (FROM) block
 * comes FIRST, then the Court (TO), then a long subject, the "I state that ..."
 * body, the legal framework, a lettered prayer, a Declaration, the signature
 * block and Enclosures — see the sample the user supplied. Used ONLY for the
 * `legal_notice` kind; every other kind keeps DRAFT_SYSTEM / DRAFT_STRUCTURE.
 */
const PIL_DRAFT_SYSTEM = `You draft a Public Interest Litigation (PIL) letter petition addressed to the Hon'ble Chief Justice of the High Court of Karnataka, on behalf of a citizen or trust in Bengaluru, concerning a serious civic grievance or public accountability failure on the part of the Bruhat Bengaluru Mahanagara Palike (BBMP) and its successor the Greater Bengaluru Authority (GBA). The specific subject matter of THIS petition comes entirely from the case intelligence below (it may be undocumented or irregular public works billing, or it may be a different civic grievance such as garbage, drainage, street lighting, encroachment, property tax or the like). Produce a COMPLETE, ready to print petition on a plain sheet.

HARD RULES:
- Produce a COMPLETE, ready to send letter petition. It stays an editable draft for human review, never claim it has been filed.
- Use ONLY the facts in the context and case intelligence below. If a specific detail (an address line, a date, a name, a figure) is NOT provided, OMIT it. NEVER output a bracketed placeholder such as [NAME], [DATE], [ADDRESS], and NEVER invent facts, figures, names, dates, case numbers or citations.
- GROUND EVERYTHING IN THE ACTUAL GRIEVANCE. Do NOT import a road/drain works billing narrative, a disbursed amount, a Job Code, missing tender/estimate/Measurement-Book documents, insurance covers or a UTR unless the case intelligence for THIS complaint actually contains them. If the complaint is not about a released bill, do not allege any bill was released. Every statute cited and every relief prayed for must fit the grievance actually before you.
- Use the exact FROM (petitioner) block, TO (Chief Justice) block, Date, case number, job number, contractor, ward and figures EXACTLY as given. Do not replace any provided value with a placeholder.
- CAUTIOUS FRAMING (non negotiable): every adverse point is a DOCUMENTED SUSPICION or red flag that calls for records and explanation. NEVER assert that any named officer, engineer or contractor committed fraud, theft, forgery or corruption. Write "raises a serious and well founded doubt", "the records do not show", "requires production of records / verification / enquiry".
- Never use dash punctuation (the en dash, the em dash, or a hyphen used to join two clauses) inside a sentence. Write complete sentences, split into separate sentences, or use a comma. Reference numbers, case/job codes and markdown bullet markers are unaffected.
- Format with Markdown so it renders cleanly: '**bold**' for the Subject line and the section headings, numbered / lettered lists for the prayer, and GitHub flavoured Markdown tables (pipe syntax with a '| --- |' separator row of plain hyphens) for any itemised data such as an insurance coverage table, schedule quantities or a compliance matrix. Do NOT wrap the whole letter in a code block.

STRUCTURE (in this exact order, populating each from the case intelligence, omitting only a section that genuinely has no data, never a bracketed placeholder):
1. The Date line at the top.
2. The FROM (petitioner) block verbatim.
3. The TO (Chief Justice) block verbatim.
4. A bold "**Subject:**" line reading "Public Interest Letter seeking urgent judicial intervention regarding" followed by an accurate description of the specific grievance in THIS case, naming the BBMP / GBA, and the Job Code, ward(s) and any related job code ONLY if the context provides them. WHEN, and only when, the case concerns undocumented, non transparent or irregular public works bill payment, use the phrasing "undocumented, non transparent and irregular bill payment practices in road and drain works executed by the BBMP and its successor the Greater Bengaluru Authority (GBA)".
5. The salutation: "Respected Hon'ble Chief Justice,".
6. An opening paragraph beginning "I, {petitioner name}" then, ONLY for each detail actually present in the FROM block, the clauses ", aged about {age} years", ", {parentage}", ", {capacity} of {organisation}", ", residing at / of {address}" (omit entirely any clause whose detail is absent, do not write an empty or invented clause), continuing "respectfully submit this representation in the nature of a Public Interest Litigation letter petition seeking urgent attention of your Lordship and this Hon'ble Court towards ..." and describing the actual grievance, followed by a sentence stating the representation is made purely in public interest and not for any personal benefit.
7. A bold heading "**NATURE AND GRAVITY OF THE ISSUE**", then the body as a sequence of paragraphs each beginning "I state that ...", "I further state that ..." or "I submit that ...", drawing on EVERY material fact, figure, finding code, missing document category, chronology gap and compliance failure in the case intelligence. Reproduce any Schedule B quantities, insurance coverage and compliance matrix tables EXACTLY as Markdown tables, keeping every row and figure unchanged.
8. The applicable legal framework, as "I submit that ..." paragraphs, citing ONLY the statutes and rules that bear on the findings actually present. WHEN the findings concern public works procurement or billing, these include the Karnataka Public Works Departmental Code, the Karnataka Financial Code, the Karnataka Transparency in Public Procurement Act 1999 and the Rules of 2000, and Clause 13 of the KW-4 works agreement. Cite the Right to Information Act 2005 Sections 4(1)(b), 6 and 7 where the non disclosure or non maintenance of records is in issue. You MAY additionally cite, where relevant and using EXACTLY this wording and NO other case law, the public trust principle in Noida Entrepreneurs Association v. NOIDA, (2011) 6 SCC 508; Section 265 of Chapter XIV of the Karnataka Municipal Corporations Act, 1976; and Article 21 of the Constitution of India. Do NOT cite a statute that has no bearing on the actual grievance, and do NOT invent or cite any other case, citation or section number.
9. A paragraph recording that the grievance has already been brought to the notice of the concerned authorities (from the case history), with copies to the higher officials where the record shows it, and that no adequate response or corrective action has been received to date. ONLY if the case intelligence shows that an amount has actually been released or disbursed, add that the amount so released continues to stand disbursed notwithstanding the unresolved discrepancies.
10. The prayer, opening "In the above circumstances, I respectfully pray that, in the interest of public accountability and transparency, your Lordship and the Hon'ble Court may kindly consider this representation as a Public Interest Petition and be pleased to", then a lettered list a), b), c) ... of the specific reliefs sought, DRAWN FROM the actual grievance and findings. Typical reliefs include directing the authorities to furnish a comprehensive status report, to remedy the civic grievance, to establish a transparent monitoring and grievance redressal mechanism, and to fix accountability of the responsible officials. WHEN, and only when, the case concerns a released or disbursed works bill, you may also pray to hold any further payment in abeyance until the missing Estimate, Administrative Sanction, Technical Sanction, tender documents, Measurement Book, insurance covers and bank confirmed UTR are produced and verified, to direct an independent audit of similar works billed across the city, to direct mandatory Ward wise and Government Order wise cost break up and mandatory TVCC review before any composite bill is released, and to recover with interest any amount found paid in excess. Always end with a general prayer to pass such further orders as the Court deems fit. Do NOT pray for a works or payment specific relief when the grievance does not involve such a payment.
11. A bold heading "**Declaration**", then a short paragraph that this representation is made solely in the interest of public accountability and transparency and not for any personal gain or motive.
12. "Yours respectfully," then the signature block: the petitioner's name in parentheses, then their capacity, organisation, address, mobile and email, using ONLY the details present in the FROM block.
13. A bold heading "**Enclosures:**", then a numbered list (I, II, III ...) of the documents relied upon that are actually present in the case intelligence (for example the representation already submitted to the department, any pre check list, certificates, portal printouts, memos or audit findings the context refers to). List ONLY documents actually referenced in the context, never invent an enclosure. If no supporting document is referenced, omit this section entirely.

Include EVERY material fact, figure, date, finding code, contractor detail and Government Order / work order / tender / file number present in the case intelligence. Length is not a constraint, do not summarize detail away. Output ONLY the petition text in Markdown, no preamble, no explanation.`;

// Real Kannada government/legal correspondence writes all figures in Arabic
// numerals even in fully-Kannada prose — LLMs left to their own devices tend to
// switch to Kannada-script digits (೦-೯), so this must be stated explicitly.
const NUMERALS_KN =
  "Even inside the Kannada text, write every number — amounts, dates, percentages, quantities, case/job numbers — using Arabic numerals (0,1,2,3,4,5,6,7,8,9), exactly as official Kannada correspondence does. NEVER use Kannada-script digits (೦೧೨೩೪೫೬೭೮೯). Example: write 'ರೂ. 17,02,087', NOT 'ರೂ. ೧೭,೦೨,೦೮೭'.";

function languageLine(language?: DraftLanguage): string {
  if (language === "Kannada") return `Write the entire draft in formal Kannada (ಕನ್ನಡ). ${NUMERALS_KN}`;
  if (language === "Bilingual") return `Write in English, then a formal Kannada (ಕನ್ನಡ) translation below, separated by a line of dashes. ${NUMERALS_KN}`;
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
}): { system: string; prompt: PromptSegment[] } {
  const what = COMPLAINT_DRAFT_KINDS[input.kind];

  // A legal notice is drafted as a PIL letter petition to the Hon'ble Chief
  // Justice (its own FROM-first structure, prayer, declaration and enclosures)
  // — a different shape from every other kind, so it returns early with its
  // dedicated system prompt rather than the department-letter structure.
  if (input.kind === "legal_notice") {
    return {
      system: `${INVESTIGATOR_PERSONA}\n\n${PIL_DRAFT_SYSTEM}`,
      prompt: [
        { text: `Complaint context:\n${input.complaintContext}`, cache: true },
        { text: `\n\nDraft the Public Interest Litigation letter petition now, following the STRUCTURE above exactly.\n\n${toneLine(input.tone)}\n${languageLine(input.language)}` },
      ],
    };
  }

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
    cm_office_letter:
      "Address to the Chief Minister's Office, Government of Karnataka (Public Grievance Cell). Summarise the full chronology of correspondence, the reminder and legal notice already sent without an adequate response, the civic/public-interest impact, and request the Chief Minister's Office to direct BBMP/the concerned department to act and respond. " +
      CAUTION,
    reminder_letter:
      "This is a REMINDER, sent because no reply has been received to our earlier letter. Open by citing the reference number and date of that ORIGINAL letter (from the case history) and state plainly that no reply or action has been received to date. Restate the original demands briefly as a numbered list. State that a reply/action is required within 7 working days of this letter, failing which the matter will be escalated. Keep it firm but courteous, one page. " +
      CAUTION,
    // NOTE: `legal_notice` intentionally has NO entry here — it is handled by a
    // dedicated early return above (PIL_DRAFT_SYSTEM, a petition to the Hon'ble
    // Chief Justice) and never reaches this extraByKind lookup.
    records_preservation:
      "Request that ALL original records (MB books, measurement sheets, QC/quality tests, geo-tagged photographs, the contractor-eligibility set, insurance, and the IFMS / eProc audit logs) be preserved in status-quo pending production, and NOT weeded, altered, or the work completed, while this matter is under examination. Cite the case number and the risk of alteration. " +
      CAUTION,
    counter_reply:
      "Respond POINT-BY-POINT to the department's latest reply in the case history. For each original demand, state whether the reply addressed it; list the specific demands and records that remain UNADDRESSED; demand the specific records named in the forensic findings; and reserve escalation if a complete response is not received within a stated period. " +
      "Place the TO (recipient) address block verbatim at the very top of the letter, and place the FROM (sender / signatory) address block verbatim at the bottom of the letter (in the signature block). Do NOT place the FROM address block at the top. " +
      CAUTION,
    clarification_request:
      "Write a short, courteous letter asking the department to CLARIFY specific points that its reply left ambiguous or incomplete — where the response was given but is unclear, internally inconsistent, or does not squarely answer what was asked. List each point needing clarification as a numbered, specific question tied to the case history; do NOT re-argue settled points or make new demands. This is a request for clarity, not an escalation. " +
      CAUTION,
  };
  const extra = extraByKind[input.kind] ?? "";
  // The full 21-section formal structure applies to substantive demand/complaint
  // letters. Kinds with their own shape or a deliberately short form (a WhatsApp
  // message, an RTI application, a short clarification/reminder-email, a single-
  // purpose request) opt out so their per-kind instruction is not overridden.
  const NON_STRUCTURED_KINDS = new Set<ComplaintDraftKind>([
    "whatsapp", "rti_from_complaint", "clarification_request",
    "reminder_email", "action_taken_request", "site_inspection_request",
  ]);
  const system = NON_STRUCTURED_KINDS.has(input.kind)
    ? DRAFT_SYSTEM
    : `${DRAFT_SYSTEM}\n\n${INVESTIGATOR_PERSONA}\n\n${DRAFT_STRUCTURE_BLOCK}`;
  // Complaint context (case chronology/replies/actions/escalations/forensic
  // findings) is identical across every kind drafted for the same complaint —
  // the escalation ladder's terminal "Multiple" stage drafts reminder_letter,
  // legal_notice and cm_office_letter back-to-back for one complaint. Putting
  // it first (as its own cache_control segment) and moving the kind-specific
  // "Draft: X." line to join extra/tone/language after it — same words, just
  // reordered — lets that loop's 2nd/3rd call reuse the cached context instead
  // of resending it. Nothing about the wording, instructions or output changed.
  return {
    system,
    prompt: [
      { text: `Complaint context:\n${input.complaintContext}`, cache: true },
      { text: `\n\nDraft: ${what}.\n\n${extra}\n${toneLine(input.tone)}\n${languageLine(input.language)}` },
    ],
  };
}
