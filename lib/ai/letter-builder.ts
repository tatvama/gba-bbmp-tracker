/**
 * PURE letter prompt builders — no server-only, no I/O, no SDK. Safe to import
 * from the MCP server and from server actions alike. The action layer
 * (lib/actions/bill-letter.ts) calls generateText() with these prompts and then
 * runs the output through the safe-language gate before anything is persisted.
 *
 * The deterministic skeleton (lib/letters/letter-skeleton.ts) is the source of
 * truth; the AI only polishes it into fluent Kannada/bilingual prose. The AI is
 * forbidden from inventing figures or making accusations — and even if it tries,
 * lintLetter() in the action layer discards the result.
 */
import type { LetterContext, LetterSkeleton } from "@/lib/letters/types";
import { skeletonToPlainText } from "@/lib/letters/letter-skeleton";
import { GROUND_LABELS_KN_REQUIRED, GROUND_LABELS_KN_OPTIONAL } from "@/lib/letters/letter-knowledge";
import type { LetterVariant } from "@/lib/constants";

export interface BuiltPrompt {
  system: string;
  prompt: string;
}

const SAFETY_RULES = `You draft BBMP / GBA (Bengaluru) public-works scrutiny letters in formal Kannada. You are cautious and factual.

NON-NEGOTIABLE RULES:
1. Every adverse point is a DOCUMENTED SUSPICION that calls for records and explanation — NEVER a finding of guilt. Never write that any named officer, engineer or contractor committed fraud, forgery, theft, cheating, bribery or corruption. For signatures, seals, stamp papers, portals or photos write "possible red flag, requires production of originals / metadata / expert verification".
2. Use ONLY the facts, figures, dates and document references given below. NEVER invent a number, name, date, rate, quantity or citation. If a value is absent, ask for the record instead of guessing.
3. Keep Kannada prose free of dash punctuation ( -, –, —, − ). Dashes are allowed ONLY inside official identifiers (job codes, GST, PAN, registration numbers, case citations).
4. Do NOT sign on behalf of Guruji, the Trust, or Sri Sai Samsthana. Use exactly the signatory block provided.
5. Preserve the numbered grounds. Each serious ground must keep its labelled parts in this order: ${GROUND_LABELS_KN_REQUIRED.join(" · ")} (optional: ${GROUND_LABELS_KN_OPTIONAL.join(" · ")}).
6. Output ONLY the finished letter text. No preamble, no markdown fences, no commentary.`;

const VARIANT_GUIDANCE: Record<LetterVariant, string> = {
  bill_stop:
    "This is a bill-stop scrutiny request to the Executive / Chief Engineer. Open with the cautious introduction, present the summary box, then each numbered ground, then the demands (produce records + withhold the bill until satisfactorily explained), then the escalation note and the caveat. Polite but firm.",
  lokayukta:
    "This is material for a Lokayukta complaint. Keep the cautious framing throughout; emphasise that records and an independent technical / site verification are sought. Include the officer-responsibility mapping and the evidence index. Do not pronounce guilt.",
  rti:
    "This is an RTI application under the RTI Act 2005. Convert each ground into a precisely worded request for certified copies of the specific records. Do not argue the merits — only seek the documents. Add the standard fee/30-day lines.",
  bilingual_summary:
    "This is a bilingual forensic summary: give formal Kannada first, then a faithful English rendering below it. Keep all figures identical in both languages.",
};

const LANGUAGE_GUIDANCE = (ctx: LetterContext) =>
  ctx.language === "Bilingual" || ctx.variant === "bilingual_summary"
    ? "Produce the letter in formal Kannada, followed by a faithful English translation under a clear heading. Keep every figure and reference identical in both."
    : "Produce the letter in formal Kannada (ಕನ್ನಡ). An English word may appear only inside an official identifier.";

/** Build the {system, prompt} pair for the AI to polish the assembled skeleton. */
export function buildLetterPrompt(ctx: LetterContext, skeleton: LetterSkeleton): BuiltPrompt {
  const skeletonText = skeletonToPlainText(skeleton);
  const system = SAFETY_RULES;
  const prompt = `${VARIANT_GUIDANCE[ctx.variant]}

${LANGUAGE_GUIDANCE(ctx)}

Use this deterministic skeleton as the single source of truth. Render it into a fluent, well-formatted official letter while keeping EVERY figure, date, document reference, demand and the exact signatory block. Do not add new grounds, numbers or accusations.

=== SKELETON (source of truth) ===
${skeletonText}
=== END SKELETON ===

Write the finished letter now.`;
  return { system, prompt };
}

/** Build a prompt that turns a free-text summary into structured findings (pre-skeleton). */
export function buildSummaryToFindingsPrompt(summary: string, jobCode: string): BuiltPrompt {
  const system = `${SAFETY_RULES}

You are extracting structured, cautious forensic grounds from a short human summary of a BBMP road / drain / building works concern. Output STRICT JSON only.`;
  const prompt = `Job code: ${jobCode || "unknown"}

Summary from the user:
"""
${summary.slice(0, 6000)}
"""

Return JSON of EXACTLY this shape (use "" when unknown; never invent figures):
{
  "findings": [
    {
      "code": "e.g. QT-OVERRUN",
      "title": "",
      "severity": "High | Medium | Low",
      "docRef": "",
      "observation": "",
      "mismatch": "",
      "suspicionReason": "",
      "workedExample": "",
      "ruleBasis": "",
      "recordDemand": "",
      "responsibleOfficer": "",
      "evidenceGrade": "A | B | C | D | E",
      "riskScore": 0
    }
  ]
}`;
  return { system, prompt };
}
