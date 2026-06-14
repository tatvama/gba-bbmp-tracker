"use server";

import { requireRole, AuthorizationError } from "@/lib/auth";
import { RTI_WRITE_ROLES, COMPLAINT_WRITE_ROLES, type UserRole } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { generateText, aiProvider, aiModel } from "@/lib/ai/provider";
import {
  buildRtiApplicationPrompt,
  buildFirstAppealPrompt,
  buildSecondAppealPrompt,
  buildReplyAnalysisPrompt,
  buildTransformPrompt,
  type RtiDraftInput,
  type FirstAppealInput,
  type SecondAppealInput,
} from "@/lib/ai/prompts";
import {
  buildRoadWorkLetterPrompt,
  buildRoadWorkReplyAnalysisPrompt,
  buildRoadWorkEscalationPrompt,
  type RoadWorkLetterInput,
  type RoadWorkReplyInput,
  type RoadWorkEscalationInput,
} from "@/lib/ai/road-work-knowledge";

export interface AiResult {
  ok: boolean;
  text?: string;
  error?: string;
}

async function gate(roles: UserRole[] = RTI_WRITE_ROLES): Promise<AiResult | null> {
  try {
    await requireRole(roles);
    return null;
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
}

export async function generateRtiDraft(input: RtiDraftInput): Promise<AiResult> {
  const denied = await gate();
  if (denied) return denied;
  const { system, prompt } = buildRtiApplicationPrompt(input);
  const r = await generateText({ system, prompt });
  return { ok: r.ok, text: r.text, error: r.error };
}

export async function generateFirstAppealDraft(input: FirstAppealInput): Promise<AiResult> {
  const denied = await gate();
  if (denied) return denied;
  const { system, prompt } = buildFirstAppealPrompt(input);
  const r = await generateText({ system, prompt });
  return { ok: r.ok, text: r.text, error: r.error };
}

export async function generateSecondAppealDraft(input: SecondAppealInput): Promise<AiResult> {
  const denied = await gate();
  if (denied) return denied;
  const { system, prompt } = buildSecondAppealPrompt(input);
  const r = await generateText({ system, prompt });
  return { ok: r.ok, text: r.text, error: r.error };
}

/**
 * Generate a road-work RTI application or complaint letter from a short summary
 * and/or a work-order extract, using the road-work inspection knowledge base.
 * Gated by the role matching the output type. Never files anything.
 */
export async function generateRoadWorkLetter(input: RoadWorkLetterInput): Promise<AiResult> {
  const roles = input.outputType === "complaint" ? COMPLAINT_WRITE_ROLES : RTI_WRITE_ROLES;
  const denied = await gate(roles);
  if (denied) return denied;
  if (!input.summary?.trim() && !input.workOrderExtract?.trim()) {
    return { ok: false, error: "Provide a short summary or upload a work order first." };
  }
  const { system, prompt } = buildRoadWorkLetterPrompt(input);
  const r = await generateText({ system, prompt, maxTokens: 4000 });
  return { ok: r.ok, text: r.text, error: r.error };
}

// ── Road-work reply analysis + escalation ──────────────────────────────────

export interface RoadWorkReplyPoint {
  request: string;
  section: string;
  status: string;
  replyExtract: string;
  appealGround: string;
}
export interface RoadWorkReplyAnalysis {
  points: RoadWorkReplyPoint[];
  overall: {
    complete: boolean;
    missingSections: string[];
    escalationRecommended: boolean;
    summary: string;
  };
}
export interface RoadWorkReplyResult {
  ok: boolean;
  analysis?: RoadWorkReplyAnalysis;
  raw?: string;
  error?: string;
}

/** Analyze a BBMP reply against the road-work framework (RTI or complaint). */
export async function analyzeRoadWorkReply(
  input: RoadWorkReplyInput & { outputType?: "rti" | "complaint" },
): Promise<RoadWorkReplyResult> {
  const roles = input.outputType === "complaint" ? COMPLAINT_WRITE_ROLES : RTI_WRITE_ROLES;
  const denied = await gate(roles);
  if (denied) return { ok: false, error: denied.error };
  if (!input.replyText.trim()) return { ok: false, error: "Paste the reply text first." };
  if (!input.originalRequests.trim()) return { ok: false, error: "Paste what you originally asked for." };

  const { system, prompt } = buildRoadWorkReplyAnalysisPrompt(input);
  const r = await generateText({ system, prompt, temperature: 0, maxTokens: 3000 });
  if (!r.ok) return { ok: false, error: r.error };

  const cleaned = (r.text ?? "").replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    const analysis = JSON.parse(cleaned) as RoadWorkReplyAnalysis;
    return { ok: true, analysis, raw: r.text };
  } catch {
    return { ok: true, raw: r.text, error: "Could not parse structured output; showing raw text." };
  }
}

/** Draft a first appeal / escalation from the reply gaps. */
export async function generateRoadWorkEscalation(input: RoadWorkEscalationInput): Promise<AiResult> {
  const roles = input.outputType === "complaint" ? COMPLAINT_WRITE_ROLES : RTI_WRITE_ROLES;
  const denied = await gate(roles);
  if (denied) return denied;
  const { system, prompt } = buildRoadWorkEscalationPrompt(input);
  const r = await generateText({ system, prompt, maxTokens: 4000 });
  return { ok: r.ok, text: r.text, error: r.error };
}

export async function transformDraft(
  currentDraft: string,
  instruction: string,
): Promise<AiResult> {
  const denied = await gate();
  if (denied) return denied;
  if (!currentDraft.trim()) return { ok: false, error: "Nothing to transform yet." };
  const { system, prompt } = buildTransformPrompt(currentDraft, instruction);
  const r = await generateText({ system, prompt });
  return { ok: r.ok, text: r.text, error: r.error };
}

export interface ReplyAnalysisItem {
  question: string;
  replyExtract: string;
  status: string;
  appealGround: string;
  notes: string;
}
export interface ReplyAnalysis {
  items: ReplyAnalysisItem[];
  overall: {
    complete: boolean;
    exemptionCited: boolean;
    extraFeeDemanded: boolean;
    delayed: boolean;
    firstAppealRecommended: boolean;
    summary: string;
  };
}

export interface ReplyAnalysisResult {
  ok: boolean;
  analysis?: ReplyAnalysis;
  raw?: string;
  error?: string;
}

export async function analyzeRtiReply(input: {
  questions: string[];
  replyText: string;
}): Promise<ReplyAnalysisResult> {
  const denied = await gate();
  if (denied) return { ok: false, error: denied.error };
  if (!input.replyText.trim()) return { ok: false, error: "Paste the reply text first." };

  const { system, prompt } = buildReplyAnalysisPrompt(input);
  const r = await generateText({ system, prompt, temperature: 0 });
  if (!r.ok) return { ok: false, error: r.error };

  // Strip code fences if present, then parse.
  const cleaned = (r.text ?? "").replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    const analysis = JSON.parse(cleaned) as ReplyAnalysis;
    return { ok: true, analysis, raw: r.text };
  } catch {
    return { ok: true, raw: r.text, error: "Could not parse structured output; showing raw text." };
  }
}

/** Persist an AI draft for later reference. Never files anything (spec §2). */
export async function saveAiDraft(input: {
  entityType?: string;
  entityId?: string;
  kind: string;
  content: string;
  prompt?: string;
  language?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  let user;
  try {
    // Either an RTI writer or a complaint writer may save a draft.
    const roles = Array.from(new Set([...RTI_WRITE_ROLES, ...COMPLAINT_WRITE_ROLES])) as UserRole[];
    user = await requireRole(roles);
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_drafts")
    .insert({
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      kind: input.kind,
      provider: aiProvider(),
      model: aiModel(),
      language: input.language ?? null,
      prompt: input.prompt ?? null,
      content: input.content,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}
