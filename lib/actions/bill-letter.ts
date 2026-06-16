"use server";

import { requireRole, AuthorizationError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMPLAINT_VERIFY_ROLES, type LetterVariant, type SignatoryKey } from "@/lib/constants";
import { generateText, isAiConfigured } from "@/lib/ai/provider";
import { buildLetterPrompt } from "@/lib/ai/letter-builder";
import { assembleSkeleton, skeletonToPlainText, letterFileName } from "@/lib/letters/letter-skeleton";
import { sanitizeDraft, lintLetter, type LintResult } from "@/lib/letters/safe-language";
import { STATUTE_MAP } from "@/lib/letters/letter-knowledge";
import type { LetterContext, LetterFinding } from "@/lib/letters/types";
import type { BillFinding } from "@/lib/forensics/types";
import type { JobAuditReport } from "@/lib/forensics/job-audit";

export interface LetterResult {
  ok: boolean;
  error?: string;
  draftId?: string;
  content?: string;
  lintOk?: boolean;
  aiUsed?: boolean;
  aiDiscarded?: boolean; // AI produced prohibited wording → deterministic fallback used
  lint?: LintResult;
}

const PREFIX_RE = /^[A-Z]+/;

function mapFinding(f: BillFinding): LetterFinding {
  const prefix = (PREFIX_RE.exec(f.code.toUpperCase())?.[0]) ?? "";
  const cls = f.findingClass;
  let mismatch: string | undefined;
  if (cls === "confirmed_mismatch") {
    mismatch = f.expected && f.actual ? `Recorded ${f.actual}; expected ${f.expected}.` : "A conflicting record is on file.";
  } else if (cls === "missing_proof") {
    mismatch = "The mandatory supporting record was not found in the supplied documents.";
  } else if (f.expected && f.actual) {
    mismatch = `Recorded ${f.actual}; expected ${f.expected}.`;
  }
  const docRef = f.sourceDocId
    ? `ಅಪ್‌ಲೋಡ್ ಮಾಡಿದ ದಾಖಲೆ (ref ${String(f.sourceDocId).slice(0, 8)})`
    : `${(f.category ?? "RECORD").toString().replace(/_/g, " ")} record on file`;
  return {
    code: f.code,
    title: f.title,
    severity: f.severity,
    docRef,
    observation: f.detail,
    mismatch,
    suspicionReason: f.safeText ?? f.detail,
    workedExample: f.workedExample,
    ruleBasis: f.ruleRef ?? STATUTE_MAP[prefix] ?? "KW-4 agreement & PWD Code",
    recordDemand: f.recordToDemand ?? "Relevant original records and certifications",
    evidenceGrade: f.evidenceGrade,
    riskScore: f.riskPoints,
  };
}

async function gate() {
  try {
    return { user: await requireRole(COMPLAINT_VERIFY_ROLES) };
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }
}

interface GenerateLetterInput {
  jobNumber: string;
  variant: LetterVariant;
  language?: "Kannada" | "Bilingual";
  signatoryKey?: SignatoryKey;
  useAi?: boolean;
  complaintId?: string | null;
  lokayuktaRef?: string | null;
}

/**
 * Build a forensic letter for a job: load the latest persisted job audit, map its
 * findings into Kannada grounds, assemble the deterministic skeleton, optionally
 * polish it with AI, and HARD-GATE the result through the safe-language linter
 * before persisting an editable draft. Nothing is ever auto-filed.
 */
export async function generateLetter(input: GenerateLetterInput): Promise<LetterResult> {
  const g = await gate();
  if (!g.user) return { ok: false, error: g.error ?? "Not authorized" };
  const admin = createAdminClient();

  // Latest persisted job audit for this job number.
  const { data: audit } = await admin
    .from("job_audits")
    .select("report, risk_score, risk_band")
    .eq("job_number", input.jobNumber)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!audit?.report) {
    return { ok: false, error: `No forensic audit found for job "${input.jobNumber}". Run the Job-Number Forensic Audit first.` };
  }
  const report = audit.report as JobAuditReport;
  const findings: LetterFinding[] = (report.rankedFindings ?? report.findings ?? []).map(mapFinding);
  if (findings.length === 0) {
    return { ok: false, error: "The audit produced no findings to base a letter on." };
  }

  const ctx: LetterContext = {
    jobCode: input.jobNumber,
    variant: input.variant,
    language: input.language ?? "Kannada",
    signatoryKey: input.signatoryKey ?? "raghav_gowda",
    lokayuktaRef: input.lokayuktaRef ?? null,
    findings,
    references: [],
  };

  let skeleton;
  try {
    skeleton = assembleSkeleton(ctx);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not assemble the letter." };
  }

  // Deterministic baseline — always safe (built from our controlled strings).
  const deterministic = sanitizeDraft(skeletonToPlainText(skeleton));
  let content = deterministic.text;
  let aiUsed = false;
  let aiDiscarded = false;

  if (input.useAi && isAiConfigured()) {
    const { system, prompt } = buildLetterPrompt(ctx, skeleton);
    const r = await generateText({ system, prompt, temperature: 0.3, maxTokens: 4000 });
    if (r.ok && r.text) {
      const cleaned = sanitizeDraft(r.text);
      if (cleaned.lint.ok) {
        content = cleaned.text;
        aiUsed = true;
      } else {
        // AI produced prohibited wording even after transformation → discard it.
        aiDiscarded = true;
      }
    }
  }

  const finalLint = lintLetter(content);
  const fileName = letterFileName(ctx);

  const { data: ins, error } = await admin
    .from("letter_drafts")
    .insert({
      job_number: input.jobNumber,
      complaint_id: input.complaintId ?? null,
      variant: input.variant,
      language: ctx.language,
      signatory_key: ctx.signatoryKey,
      content,
      skeleton,
      payments: null,
      quantities: null,
      evidence_index: skeleton.evidenceIndex,
      summary_box: skeleton.summaryBox,
      risk_score: report.risk?.score ?? audit.risk_score ?? null,
      band: report.risk?.band ?? audit.risk_band ?? null,
      ai_used: aiUsed,
      lint_ok: finalLint.ok,
      file_name: fileName,
      created_by: g.user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message, content, lintOk: finalLint.ok };

  return {
    ok: true,
    draftId: (ins as { id: string }).id,
    content,
    lintOk: finalLint.ok,
    aiUsed,
    aiDiscarded,
    lint: finalLint,
  };
}

/** Re-run generation for an existing draft (e.g. toggling AI / variant). */
export async function regenerateLetter(draftId: string, overrides?: Partial<GenerateLetterInput>): Promise<LetterResult> {
  const g = await gate();
  if (g.error) return { ok: false, error: g.error };
  const admin = createAdminClient();
  const { data: draft } = await admin
    .from("letter_drafts")
    .select("job_number, variant, language, signatory_key, complaint_id")
    .eq("id", draftId)
    .maybeSingle();
  if (!draft) return { ok: false, error: "Draft not found." };
  return generateLetter({
    jobNumber: (draft.job_number as string),
    variant: (overrides?.variant ?? draft.variant) as LetterVariant,
    language: (overrides?.language ?? draft.language) as "Kannada" | "Bilingual",
    signatoryKey: (overrides?.signatoryKey ?? draft.signatory_key) as SignatoryKey,
    useAi: overrides?.useAi ?? true,
    complaintId: (draft.complaint_id as string) ?? null,
  });
}

/** Persist an edited letter draft (after human review). */
export async function saveLetterEdit(draftId: string, content: string): Promise<LetterResult> {
  const g = await gate();
  if (g.error) return { ok: false, error: g.error };
  const lint = lintLetter(content);
  const admin = createAdminClient();
  const { error } = await admin.from("letter_drafts").update({ content, lint_ok: lint.ok }).eq("id", draftId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, draftId, content, lintOk: lint.ok, lint };
}

/** Expose the safe-language linter to the UI (live check on the editable draft). */
export async function lintLetterAction(text: string): Promise<{ ok: boolean; lint: LintResult }> {
  const lint = lintLetter(text);
  return { ok: lint.ok, lint };
}
