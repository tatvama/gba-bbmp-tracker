import "server-only";
/**
 * The escalation ladder's orchestrator — request-free (takes no cookies/session,
 * mirrors lib/ai/complaint-draft.ts's runComplaintDraft), so it can run from
 * instrumentation.ts's in-process interval with no HTTP request in flight, same
 * reason lib/forensic/commit-runner.ts keeps lib/settings (next/headers) out of
 * worker-reachable modules — this file reads app_settings directly instead.
 *
 * sweepEscalationCycles() finds every complaint whose CURRENT stage deadline has
 * elapsed, auto-drafts that stage's letter (or all three escalation letters at
 * the terminal transition), queues it into the print queue (letter_drafts,
 * print_status='pending' — the same table/status the ZIP-import bill-stop
 * letter and print-queue-list.tsx already use), advances the stage, and
 * computes the next deadline from escalation_flow_configs.
 */
import type { DbClient } from "@/lib/db";
import { createAdminClient } from "@/lib/db";
import { runComplaintDraft } from "@/lib/ai/complaint-draft";
import { DEFAULT_COMPLAINT_SETTINGS, COMPLAINT_DRAFT_KINDS, type ComplaintSettings, type DraftLanguage } from "@/lib/constants";
import {
  draftKindsForConfig,
  computeStageDeadline,
  ACTIVE_LADDER_STAGES,
  type EscalationFlowConfigRow,
} from "@/lib/complaints/escalation-cycle";

// Redeclared locally (not imported from lib/settings.ts) — that module imports
// next/headers, which must never load in a request-free background context.
const COMPLAINT_SETTINGS_KEY = "complaint_settings";

interface DueComplaint {
  id: string;
  internal_case_number: string | null;
  job_number: string | null;
  escalation_stage: string;
  escalation_round: number;
}

export interface SweepResult {
  processed: number;
  skipped: number;
  errors: string[];
}

async function loadComplaintSettings(admin: DbClient): Promise<ComplaintSettings> {
  const { data } = await admin.from("app_settings").select("value").eq("key", COMPLAINT_SETTINGS_KEY).maybeSingle();
  return { ...DEFAULT_COMPLAINT_SETTINGS, ...((data?.value as Partial<ComplaintSettings>) ?? {}) };
}

function transitionTitle(nextStage: string): string {
  switch (nextStage) {
    case "reminder_sent": return "Reminder letter auto-drafted (no reply received)";
    case "legal_notice_sent": return "Legal notice auto-drafted (reminder unanswered)";
    case "escalated": return "Escalation letters auto-drafted (Lokayukta / Chief Secretary / CM office)";
    default: return "Escalation stage advanced";
  }
}

/** Runs one complaint's due stage transition. Returns true if it advanced. */
async function advanceOneComplaint(
  admin: DbClient,
  complaint: DueComplaint,
  configByStage: Map<string, EscalationFlowConfigRow>,
  settings: ComplaintSettings,
): Promise<boolean> {
  const config = configByStage.get(complaint.escalation_stage);
  if (!config) return false; // stage has no (active) config — leave it alone

  const nextStage = config.on_elapse_next_stage;

  // Idempotency guard: never re-fire the same round+stage transition twice.
  const { data: existingEvent } = await admin
    .from("complaint_cycle_events")
    .select("id")
    .eq("complaint_id", complaint.id)
    .eq("round", complaint.escalation_round)
    .eq("event", nextStage)
    .limit(1)
    .maybeSingle();
  if (existingEvent) return false;

  const kinds = draftKindsForConfig(config);
  if (!kinds.length) return false;

  // Match the ORIGINAL letter's language so the whole cycle reads consistently.
  const { data: firstLetter } = await admin
    .from("letter_drafts")
    .select("language")
    .eq("complaint_id", complaint.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const language = (firstLetter?.language as DraftLanguage | undefined) ?? "Kannada";

  let anySucceeded = false;
  const now = new Date();

  for (const kind of kinds) {
    const result = await runComplaintDraft(admin, { complaintId: complaint.id, kind, language });
    if (!result.ok || !result.text) continue;

    const { data: letterDraft } = await admin
      .from("letter_drafts")
      .insert({
        complaint_id: complaint.id,
        job_number: complaint.job_number ?? null,
        variant: kind,
        language,
        content: result.text,
        ai_used: true,
        lint_ok: !result.lintWarning,
        file_name: `${COMPLAINT_DRAFT_KINDS[kind]} - ${complaint.internal_case_number ?? complaint.id}`,
        print_status: "pending",
      })
      .select("id")
      .single();

    const { data: aiDraft } = await admin
      .from("ai_drafts")
      .insert({ entity_type: "complaint", entity_id: complaint.id, kind, content: result.text, language })
      .select("id")
      .single();

    await admin.from("complaint_cycle_events").insert({
      complaint_id: complaint.id,
      round: complaint.escalation_round,
      stage: nextStage,
      event: nextStage,
      letter_draft_id: letterDraft?.id ?? null,
      ai_draft_id: aiDraft?.id ?? null,
    });

    anySucceeded = true;
  }

  // Nothing drafted (e.g. AI provider down) — leave the deadline in the past so
  // the next sweep retries, rather than silently losing this stage.
  if (!anySucceeded) return false;

  const nextConfig = configByStage.get(nextStage);
  const deadline = nextConfig
    ? computeStageDeadline(now, nextConfig, { excludeSaturdays: settings.excludeSaturdaysAsWorkingDay })
    : null;

  await admin
    .from("complaints")
    .update({
      escalation_stage: nextStage,
      escalation_stage_entered_at: now.toISOString(),
      escalation_stage_deadline: deadline ? deadline.toISOString() : null,
    })
    .eq("id", complaint.id);

  await admin.from("complaint_timeline").insert({
    complaint_id: complaint.id,
    event_type: nextStage === "escalated" ? "Escalation" : "Note",
    event_date: now.toISOString(),
    title: transitionTitle(nextStage),
    summary: `Auto-drafted by the escalation scheduler (round ${complaint.escalation_round}) and queued in the Print Queue for review.`,
  });

  return true;
}

/** Finds every complaint whose current stage deadline has elapsed and advances it. */
export async function sweepEscalationCycles(): Promise<SweepResult> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await admin
    .from("complaints")
    .select("id, internal_case_number, job_number, escalation_stage, escalation_round")
    .in("escalation_stage", ACTIVE_LADDER_STAGES)
    .not("escalation_stage_deadline", "is", null)
    .lte("escalation_stage_deadline", nowIso)
    .limit(50);

  if (error) return { processed: 0, skipped: 0, errors: [error.message] };
  if (!due?.length) return { processed: 0, skipped: 0, errors: [] };

  const { data: configRows } = await admin.from("escalation_flow_configs").select("*").eq("is_active", true);
  const configByStage = new Map((configRows as EscalationFlowConfigRow[] | null ?? []).map((c) => [c.stage_key, c]));
  const settings = await loadComplaintSettings(admin);

  let processed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const complaint of due as DueComplaint[]) {
    try {
      const advanced = await advanceOneComplaint(admin, complaint, configByStage, settings);
      if (advanced) processed++;
      else skipped++;
    } catch (e) {
      errors.push(`${complaint.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { processed, skipped, errors };
}
