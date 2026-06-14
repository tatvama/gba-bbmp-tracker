"use server";

import { requireRole, AuthorizationError } from "@/lib/auth";
import { RTI_WRITE_ROLES } from "@/lib/constants";
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

export interface AiResult {
  ok: boolean;
  text?: string;
  error?: string;
}

async function gate(): Promise<AiResult | null> {
  try {
    await requireRole(RTI_WRITE_ROLES);
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
    user = await requireRole(RTI_WRITE_ROLES);
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
