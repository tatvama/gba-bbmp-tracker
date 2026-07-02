"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireRole, AuthorizationError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";
import { analyzeReplyGap, type ReplyGap } from "@/lib/ai/reply-gap-analyzer";

export interface ReplyGapResult {
  ok: boolean;
  data?: ReplyGap;
  error?: string;
}

/**
 * Gather a complaint's demands (the filed letter + the records its forensic findings
 * require) and the department's latest reply text. Shared by the manual Counter-Reply
 * panel (via analyzeReplyGapAction) AND the AI Complaint Advisor's automated
 * reply-agent, so both reason from identical inputs — no duplicated gathering logic.
 * Returns replyText: null (not an error) when no reply has been found yet.
 */
export async function gatherReplyGapInputs(
  admin: SupabaseClient,
  complaintId: string,
  replyTextOverride?: string,
): Promise<{ demands: string; replyText: string | null; complaintFound: boolean }> {
  const { data: c } = await admin
    .from("complaints")
    .select("id, job_number, description, title")
    .eq("id", complaintId)
    .maybeSingle();
  if (!c) return { demands: "", replyText: null, complaintFound: false };
  const jobNumber = (c.job_number as string) ?? null;

  // Demands = filed letter + records-to-demand from the forensic findings.
  let demands = "";
  if (jobNumber) {
    const { data: ld } = await admin
      .from("letter_drafts")
      .select("content")
      .eq("job_number", jobNumber)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ld?.content) demands += `Filed letter:\n${ld.content}\n\n`;
    const { data: au } = await admin
      .from("job_audits")
      .select("report")
      .eq("job_number", jobNumber)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const ranked = ((au?.report as { rankedFindings?: { recordToDemand?: string }[] } | null)?.rankedFindings) ?? [];
    const recs = ranked.map((f) => f.recordToDemand).filter(Boolean) as string[];
    if (recs.length) demands += `Records demanded:\n- ${recs.join("\n- ")}\n`;
  }
  if (!demands.trim()) demands = `${c.title as string}\n${(c.description as string) ?? ""}`;

  // Reply text: caller-supplied, else the latest reply/ATR document OCR, else a logged reply.
  let replyText = (replyTextOverride ?? "").trim();
  if (!replyText) {
    const { data: docs } = await admin
      .from("complaint_documents")
      .select("ocr_clean_text, ocr_raw_text, document_type, uploaded_at")
      .eq("complaint_id", complaintId)
      .order("uploaded_at", { ascending: false })
      .limit(20);
    const replyDoc = (docs ?? []).find(
      (d) => /reply|action taken|atr/i.test((d.document_type as string) ?? "") && (d.ocr_clean_text || d.ocr_raw_text),
    );
    if (replyDoc) replyText = ((replyDoc.ocr_clean_text as string) || (replyDoc.ocr_raw_text as string) || "").trim();
  }
  if (!replyText) {
    const { data: replies } = await admin
      .from("complaint_replies")
      .select("reply_full_text, reply_summary, created_at")
      .eq("complaint_id", complaintId)
      .order("created_at", { ascending: false })
      .limit(1);
    const rep = replies?.[0];
    if (rep) replyText = ((rep.reply_full_text as string) || (rep.reply_summary as string) || "").trim();
  }

  return { demands, replyText: replyText || null, complaintFound: true };
}

/**
 * Gather a complaint's demands and the department's latest reply, then AI-analyse
 * what the reply did NOT address — the basis for a counter-reply / escalation.
 */
export async function analyzeReplyGapAction(input: { complaintId: string; replyText?: string }): Promise<ReplyGapResult> {
  try {
    await requireRole(COMPLAINT_FIELD_ROLES);
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const admin = createAdminClient();
  const { demands, replyText, complaintFound } = await gatherReplyGapInputs(admin, input.complaintId, input.replyText);
  if (!complaintFound) return { ok: false, error: "Complaint not found." };
  if (!replyText) {
    return { ok: false, error: "No department reply found. Scan/upload the reply (or paste it) first." };
  }

  const r = await analyzeReplyGap({ demands, replyText });
  return { ok: r.ok, data: r.data, error: r.error };
}
