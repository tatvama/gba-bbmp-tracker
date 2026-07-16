import "server-only";
import { extractJson } from "@/lib/ai/json-extract";
import { isAiConfigured } from "@/lib/ai/provider";
import { SYNTHESIS_SYSTEM, PROMPT_VERSIONS } from "../prompts";
import type { Observation, Synthesis, ComplianceItem, TimelineEvent, FinancialSummary, Reference, OfficerRef } from "../types";

/**
 * Stage 7 — Investigation Reasoning (grounded AI). Consumes the STRUCTURED brief
 * (findings/financials/compliance/timeline/entities) — never raw OCR — and emits
 * a strict-JSON investigation synthesis whose suspicions/contradictions reference
 * observation ids. Falls back to a deterministic synthesis when AI is off so the
 * pipeline never blocks.
 */
export interface SynthesisInput {
  project: { workDescription: string | null; ward?: string | null; division?: string | null };
  contractor: { name: string | null; gstin?: string | null; pan?: string | null };
  officers: OfficerRef[];
  references: Reference[];
  financials: FinancialSummary;
  findings: Observation[];
  correlations: Observation[];
  compliance: ComplianceItem[];
  timeline: TimelineEvent[];
  riskAssessment: { band: string | null; score: number | null };
  replies: any[];
  actions: any[];
}

const bandScore = (band: string | null): number => ({ bill_stop: 90, serious: 75, procedural: 55, low: 30 }[band ?? ""] ?? 50);

function fallbackSynthesis(input: SynthesisInput): Synthesis {
  const all = [...input.findings, ...input.correlations];
  const ranked = [...all].sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.severity] - { High: 0, Medium: 1, Low: 2 }[b.severity]));
  const demands = [...new Set([
    ...all.map((f) => f.recordToDemand).filter(Boolean) as string[],
    ...input.compliance.map((c) => c.recordToDemand).filter(Boolean) as string[],
  ])];
  const outstanding = [
    ...input.replies.map((r) => r.issues_remaining).filter(Boolean).map((i: string) => ({ issue: i, status: "open" })),
    ...input.compliance.filter((c) => c.status === "not_shown").map((c) => ({ issue: c.requirement, status: "not produced" })),
  ].slice(0, 20);
  return {
    situation: `${input.project.workDescription ?? "This work"}${input.project.ward ? ` (Ward ${input.project.ward})` : ""}. Forensic risk band ${input.riskAssessment.band ?? "under review"}. ${all.length} documented suspicion(s) requiring production of records.`,
    prioritizedSuspicions: ranked.slice(0, 12).map((f) => ({ title: `${f.code ? `[${f.code}] ` : ""}${f.statement.slice(0, 80)}`, detail: f.statement, observationIds: [f.id] })),
    outstandingIssues: outstanding,
    contradictions: input.correlations.map((c) => ({ summary: c.statement, observationIds: [c.id] })),
    documentsToDemand: demands.slice(0, 30),
    specificRequests: ["Produce certified copies of all records listed under Documentary Evidence and Documents to be Produced.", "Furnish a point-wise explanation for each documented suspicion."],
    reliefs: ["Withhold / recover any amount found in excess, subject to verification.", "Order a departmental enquiry into the documented discrepancies."],
    futureCourse: ["If a complete reply and the records are not received within the stated period, the matter will be escalated to higher authorities and the Karnataka Lokayukta."],
    confidenceScore: bandScore(input.riskAssessment.band),
  };
}

function serializeBrief(input: SynthesisInput): string {
  const L: string[] = [];
  L.push(`WORK: ${input.project.workDescription ?? "-"} | Ward ${input.project.ward ?? "-"} | Division ${input.project.division ?? "-"}`);
  L.push(`CONTRACTOR: ${input.contractor.name ?? "-"}${input.contractor.gstin ? ` GSTIN ${input.contractor.gstin}` : ""}${input.contractor.pan ? ` PAN ${input.contractor.pan}` : ""}`);
  L.push(`RISK: band ${input.riskAssessment.band ?? "-"} score ${input.riskAssessment.score ?? "-"}`);
  if (input.financials.treasuryLossTotal) L.push(`POSSIBLE EXPOSURE: ${input.financials.treasuryLossTotal}`);
  if (input.financials.lossLines.length) L.push(`LOSS LINES: ${input.financials.lossLines.map((l) => `${l.label}=₹${l.exposure}`).join("; ")}`);
  if (input.references.length) L.push(`REFERENCES: ${input.references.map((r) => `${r.label} ${r.value}`).join("; ")}`);
  if (input.officers.length) L.push(`OFFICERS: ${input.officers.map((o) => `${o.name}${o.designation ? ` (${o.designation})` : ""}`).join("; ")}`);
  L.push("FINDINGS (evidence-linked; cite these obs ids):");
  for (const f of [...input.findings, ...input.correlations]) {
    L.push(`  ${f.id}${f.code ? ` [${f.code}]` : ""} (${f.severity}): ${f.statement.slice(0, 240)}${f.recordToDemand ? ` | demand: ${f.recordToDemand}` : ""}`);
  }
  if (input.compliance.length) { L.push("COMPLIANCE:"); for (const c of input.compliance) L.push(`  - ${c.area}: ${c.requirement} [${c.status}]${c.recordToDemand ? ` demand: ${c.recordToDemand}` : ""}`); }
  if (input.timeline.length) { L.push("CHRONOLOGY:"); for (const t of input.timeline.slice(0, 40)) L.push(`  - ${t.date ?? "?"}: ${t.event}`); }
  for (const r of input.replies.slice(-8)) L.push(`REPLY (${r.reply_date ?? "?"}): ${r.reply_summary ?? ""}${r.issues_remaining ? ` | unresolved: ${r.issues_remaining}` : ""}`);
  for (const a of input.actions.slice(-8)) L.push(`ACTION (${a.action_taken_date ?? "?"}): ${a.action_summary ?? ""}${a.pending_work ? ` | pending: ${a.pending_work}` : ""}`);
  return L.join("\n").slice(0, 30_000);
}

const SHAPE = `{
  "situation": "2-4 sentence neutral case situation",
  "prioritizedSuspicions": [{"title": "short", "detail": "why it matters, cautious", "observationIds": ["obs_1"]}],
  "outstandingIssues": [{"issue": "string", "status": "open|partial|answered"}],
  "contradictions": [{"summary": "string", "observationIds": ["obs_2"]}],
  "documentsToDemand": ["specific record"],
  "specificRequests": ["clear ask"],
  "reliefs": ["relief sought"],
  "futureCourse": ["escalation step"],
  "confidenceScore": 0
}`;

export async function synthesizeCase(input: SynthesisInput): Promise<{ synthesis: Synthesis; usedAi: boolean; promptVersion: string }> {
  const fallback = fallbackSynthesis(input);
  if (!isAiConfigured()) return { synthesis: fallback, usedAi: false, promptVersion: PROMPT_VERSIONS.synthesis };

  const prompt = `From the case-intelligence brief below, output STRICT JSON of EXACTLY this shape:\n${SHAPE}\n\nEvery prioritizedSuspicion and contradiction MUST cite real obs ids from the brief. Do not invent findings, figures, names or references.\n\n=== CASE INTELLIGENCE BRIEF ===\n${serializeBrief(input)}`;
  // 8000 (not 4000): the full synthesis JSON — situation + up to 12 suspicions
  // (title+detail+ids) + outstanding + contradictions + up to 30 documentsToDemand
  // + requests + reliefs + futureCourse — routinely exceeded 4000 tokens and
  // truncated mid-JSON, so extractJson failed to parse and the whole stage
  // silently fell back to deterministic (usedAi=false). That in turn made every
  // artifact permanently "degraded" (ai_synthesis_used=false), forcing a full
  // rebuild on every draft/trigger. See the same fix in lib/ai/bill-forensics.ts.
  const r = await extractJson<Partial<Synthesis>>({ system: SYNTHESIS_SYSTEM, prompt, fallback: {}, maxTokens: 8000, cache: { system: true } });
  if (!r.ok || !r.data || !r.data.situation) return { synthesis: fallback, usedAi: false, promptVersion: PROMPT_VERSIONS.synthesis };

  // The model may return a non-array for any list field; never let that throw and
  // collapse the whole (otherwise valid, deterministic) artifact — fall back per
  // field instead. arr() also treats a non-empty array as "use it", empty/invalid
  // as "use fallback".
  const d = r.data;
  const arr = <T,>(v: unknown, fb: T[]): T[] => (Array.isArray(v) && v.length ? (v as T[]) : fb);
  const synthesis: Synthesis = {
    situation: d.situation ?? fallback.situation,
    prioritizedSuspicions: arr(d.prioritizedSuspicions, fallback.prioritizedSuspicions).map((s) => ({ title: s.title ?? "", detail: s.detail ?? "", observationIds: Array.isArray(s.observationIds) ? s.observationIds : [] })),
    outstandingIssues: arr(d.outstandingIssues, fallback.outstandingIssues),
    contradictions: arr(d.contradictions, fallback.contradictions).map((c) => ({ summary: c.summary ?? "", observationIds: Array.isArray(c.observationIds) ? c.observationIds : [] })),
    documentsToDemand: arr(d.documentsToDemand, fallback.documentsToDemand),
    specificRequests: arr(d.specificRequests, fallback.specificRequests),
    reliefs: arr(d.reliefs, fallback.reliefs),
    futureCourse: arr(d.futureCourse, fallback.futureCourse),
    confidenceScore: typeof d.confidenceScore === "number" ? d.confidenceScore : fallback.confidenceScore,
  };
  return { synthesis, usedAi: true, promptVersion: PROMPT_VERSIONS.synthesis };
}
