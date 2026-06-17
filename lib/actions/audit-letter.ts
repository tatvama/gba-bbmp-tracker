"use server";

import { requireRole, AuthorizationError } from "@/lib/auth";
import {
  RTI_WRITE_ROLES,
  COMPLAINT_WRITE_ROLES,
  LETTER_SIGNATORIES,
  type UserRole,
  type LetterVariant,
  type SignatoryKey,
} from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { generateText, isAiConfigured } from "@/lib/ai/provider";
import { buildRoadWorkLetterPrompt } from "@/lib/ai/road-work-knowledge";
import { assembleSkeleton, skeletonToPlainText } from "@/lib/letters/letter-skeleton";
import { sanitizeDraft } from "@/lib/letters/safe-language";
import { suspicionsToFindings, flagSummaryForCodes } from "@/lib/letters/from-suspicions";
import { computeLossExposure, type LossLineInput } from "@/lib/forensics/loss-exposure";
import { inrFiguresAndWords } from "@/lib/format-inr";
import type { LetterContext, LetterRecipient, LetterSkeleton, FlagSummary, LossBox } from "@/lib/letters/types";

export interface AuditSender {
  signatoryKey?: SignatoryKey | null;
  name?: string | null;
  address?: string | null;
  mobile?: string | null;
}

export interface AuditIntake {
  outputType: "rti" | "complaint";
  language: "English" | "Kannada" | "Bilingual";
  /** Letter variant for the deterministic skeleton (default: rti / bill_stop). */
  variant?: LetterVariant;
  summary?: string | null;
  workOrderExtract?: string | null;
  wardName?: string | null;
  jobNumber?: string | null;
  roadName?: string | null;
  contractor?: string | null;
  scope?: "smart" | "all";
  selectedCodes: string[];
  notes?: Record<string, string>;
  recipient?: LetterRecipient | null;
  ccChain?: LetterRecipient[] | null;
  sender?: AuditSender | null;
  lossLines?: LossLineInput[] | null;
  useAi?: boolean;
}

export interface AuditLetterResult {
  ok: boolean;
  text?: string;
  error?: string;
  aiUsed?: boolean;
  /** AI tripped the safe-language linter → deterministic fallback used. */
  aiDiscarded?: boolean;
  flagSummary?: FlagSummary;
  lossBox?: LossBox | null;
  skeleton?: LetterSkeleton;
}

const writeRoles = (outputType: "rti" | "complaint"): UserRole[] =>
  outputType === "complaint" ? COMPLAINT_WRITE_ROLES : RTI_WRITE_ROLES;

/** Build the loss-estimate box (figures + words) from any supplied loss lines. */
function buildLossBox(lossLines: LossLineInput[] | null | undefined, codeCount: number): LossBox | null {
  if (!lossLines || !lossLines.length) return null;
  const { lines, totalPossibleExposure } = computeLossExposure(lossLines);
  const definite = inrFiguresAndWords(totalPossibleExposure);
  const suspectedCount = Math.max(0, codeCount - lossLines.length);
  return {
    definiteFigures: definite.figures,
    definiteWords: definite.words,
    suspectedFigures: suspectedCount ? "₹—" : "₹0",
    suspectedWords: suspectedCount
      ? `${suspectedCount} record-less suspicion(s) — amount to be quantified after records are produced`
      : "Nil",
    lines: lines.map((l) => ({ label: l.label, figures: inrFiguresAndWords(l.exposure).figures, note: l.caveat })),
  };
}

/**
 * Generate an Audit & Draft letter (RTI / complaint / bill-stop) from the ticked
 * 180-bank suspicions. The deterministic skeleton is always built first (the safe
 * baseline); AI polish is applied only if it passes the safe-language linter,
 * otherwise the deterministic version is returned (aiDiscarded=true). Never files.
 */
export async function generateAuditLetter(input: AuditIntake): Promise<AuditLetterResult> {
  try {
    await requireRole(writeRoles(input.outputType));
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  if (!input.selectedCodes?.length) {
    return { ok: false, error: "Select at least one suspicion to review before drafting." };
  }

  const flagSummary = flagSummaryForCodes(input.selectedCodes);
  const lossBox = buildLossBox(input.lossLines, input.selectedCodes.length);

  // "From Whom": a registered signatory or a custom applicant.
  const customSender =
    input.sender && !input.sender.signatoryKey && input.sender.name?.trim()
      ? { name: input.sender.name.trim(), address: input.sender.address ?? null, mobile: input.sender.mobile ?? null }
      : null;
  const signatoryKey = (input.sender?.signatoryKey ?? "raghav_gowda") as SignatoryKey;
  const signatory = LETTER_SIGNATORIES[signatoryKey];
  const applicantName = customSender?.name ?? signatory?.name ?? null;
  const applicantAddress = customSender?.address ?? signatory?.address ?? null;
  const applicantPhone = customSender?.mobile ?? signatory?.mobile ?? null;

  const findings = suspicionsToFindings({
    codes: input.selectedCodes,
    notes: input.notes,
    language: input.language,
  });

  const ctx: LetterContext = {
    jobCode: input.jobNumber || "—",
    ward: input.wardName ?? null,
    workName: input.roadName ?? null,
    contractor: input.contractor ?? null,
    variant: input.variant ?? (input.outputType === "rti" ? "rti" : "bill_stop"),
    language: input.language === "Kannada" ? "Kannada" : "Bilingual",
    signatoryKey,
    customSender,
    recipient: input.recipient ?? null,
    ccChain: input.ccChain ?? null,
    findings,
    references: [],
    flagSummary,
    lossBox,
  };

  let skeleton: LetterSkeleton;
  try {
    skeleton = assembleSkeleton(ctx);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not assemble the letter." };
  }

  // Deterministic baseline — always safe (built from our controlled strings).
  let content = sanitizeDraft(skeletonToPlainText(skeleton)).text;
  let aiUsed = false;
  let aiDiscarded = false;

  if ((input.useAi ?? true) && isAiConfigured()) {
    const { system, prompt } = buildRoadWorkLetterPrompt({
      outputType: input.outputType,
      language: input.language,
      summary: input.summary ?? null,
      workOrderExtract: input.workOrderExtract ?? null,
      wardName: input.wardName ?? null,
      jobNumber: input.jobNumber ?? null,
      roadName: input.roadName ?? null,
      contractor: input.contractor ?? null,
      applicantName,
      applicantAddress,
      applicantPhone,
      scope: input.scope ?? "smart",
      selectedCodes: input.selectedCodes,
      recipient: input.recipient ?? null,
      ccChain: input.ccChain ?? null,
    });
    const r = await generateText({ system, prompt, temperature: 0.3, maxTokens: 4000 });
    if (r.ok && r.text) {
      const cleaned = sanitizeDraft(r.text);
      if (cleaned.lint.ok) {
        content = cleaned.text;
        aiUsed = true;
      } else {
        aiDiscarded = true; // prohibited wording even after transformation → keep the safe baseline
      }
    }
  }

  return { ok: true, text: content, aiUsed, aiDiscarded, flagSummary, lossBox, skeleton };
}

export interface SaveAuditIntakeInput {
  outputType: "rti" | "complaint";
  entityType?: string | null;
  entityId?: string | null;
  jobNumber?: string | null;
  wardId?: string | null;
  roadName?: string | null;
  contractor?: string | null;
  language: string;
  scope?: string | null;
  selectedCodes: string[];
  notes?: Record<string, string>;
  recipient?: LetterRecipient | null;
  ccChain?: LetterRecipient[] | null;
  sender?: AuditSender | null;
  flagSummary?: FlagSummary | null;
  lossLines?: LossLineInput[] | null;
  lossTotal?: number | null;
  skeleton?: LetterSkeleton | null;
  content?: string | null;
  aiDraftId?: string | null;
}

/** Persist the structured intake behind a generated draft (reproducible/editable). */
export async function saveAuditIntake(
  input: SaveAuditIntakeInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  let user;
  try {
    const roles = Array.from(new Set([...RTI_WRITE_ROLES, ...COMPLAINT_WRITE_ROLES])) as UserRole[];
    user = await requireRole(roles);
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_intakes")
    .insert({
      output_type: input.outputType,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      job_number: input.jobNumber ?? null,
      ward_id: input.wardId ?? null,
      road_name: input.roadName ?? null,
      contractor: input.contractor ?? null,
      language: input.language,
      scope: input.scope ?? "smart",
      selected_codes: input.selectedCodes,
      notes: input.notes ?? {},
      recipient: input.recipient ?? null,
      cc_chain: input.ccChain ?? null,
      sender: input.sender ?? null,
      flag_counts: input.flagSummary ?? null,
      loss_lines: input.lossLines ?? null,
      loss_total: input.lossTotal ?? null,
      skeleton: input.skeleton ?? null,
      content: input.content ?? null,
      ai_draft_id: input.aiDraftId ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id: string }).id };
}

/** Attach the created case + AI draft to an existing intake row (post-approve). */
export async function linkAuditIntake(
  intakeId: string,
  patch: { entityType?: string; entityId?: string; aiDraftId?: string; content?: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const roles = Array.from(new Set([...RTI_WRITE_ROLES, ...COMPLAINT_WRITE_ROLES])) as UserRole[];
    await requireRole(roles);
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("audit_intakes")
    .update({
      entity_type: patch.entityType ?? null,
      entity_id: patch.entityId ?? null,
      ai_draft_id: patch.aiDraftId ?? null,
      ...(patch.content != null ? { content: patch.content } : {}),
    })
    .eq("id", intakeId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
