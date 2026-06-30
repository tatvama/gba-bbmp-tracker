import "server-only";
import { extractJson, extractorSystem } from "@/lib/ai/json-extract";

/**
 * AI "reply-gap" analysis: given what was DEMANDED (the filed letter + the records
 * the forensic findings require) and the department's REPLY, identify which demands
 * were addressed, partly addressed, or ignored — the basis for a counter-reply /
 * escalation. Cautious: it reports what the reply does/doesn't cover, never accuses.
 */

export interface ReplyGapPoint {
  demand: string;
  status: "addressed" | "partial" | "unaddressed";
  replyExtract: string;
}

export interface ReplyGap {
  points: ReplyGapPoint[];
  unaddressedCount: number;
  summary: string;
  escalationRecommended: boolean;
}

function fallback(): ReplyGap {
  return { points: [], unaddressedCount: 0, summary: "", escalationRecommended: false };
}

export async function analyzeReplyGap(input: {
  demands: string;
  replyText: string;
}): Promise<{ ok: boolean; data: ReplyGap; error?: string }> {
  const base = fallback();
  if (!input.replyText?.trim()) return { ok: false, data: base, error: "No department reply text to analyse." };
  if (!input.demands?.trim()) return { ok: false, data: base, error: "No demands on record to compare against." };

  const system = extractorSystem(
    "Compare a citizen's demands against a government department's reply and report, point by point, what the reply did and did NOT address. Be factual and cautious — describe coverage, never allege wrongdoing.",
  );
  const prompt = `DEMANDS (what was asked / records sought):
${input.demands.slice(0, 8_000)}

DEPARTMENT REPLY (OCR):
${input.replyText.slice(0, 10_000)}

Output STRICT JSON of EXACTLY this shape:
{
  "points": [ { "demand": "one demand", "status": "addressed | partial | unaddressed", "replyExtract": "the part of the reply that addresses it, or empty" } ],
  "unaddressedCount": 0,
  "summary": "2-3 sentence plain summary of what remains unanswered",
  "escalationRecommended": true
}
Base 'points' on the actual demands; mark a demand 'unaddressed' if the reply is silent or evasive on it.`;

  const r = await extractJson<ReplyGap>({ system, prompt, fallback: base, maxTokens: 2200 });
  const data = { ...base, ...r.data };
  data.points = Array.isArray(data.points) ? data.points : [];
  data.unaddressedCount = data.points.filter((p) => p.status === "unaddressed").length;
  data.escalationRecommended = data.escalationRecommended || data.unaddressedCount > 0;
  return { ok: r.ok, data, error: r.ok ? undefined : r.error };
}
