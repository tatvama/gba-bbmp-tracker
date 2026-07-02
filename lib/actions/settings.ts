"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole, AuthorizationError } from "@/lib/auth";
import { DEADLINE_RULES_KEY, COMPLAINT_SETTINGS_KEY } from "@/lib/settings";
import {
  DEFAULT_DEADLINE_RULES, type DeadlineRules,
  DEFAULT_COMPLAINT_SETTINGS, type ComplaintSettings,
} from "@/lib/constants";
import type { ActionState } from "@/lib/actions/contacts";

const KEYS: (keyof DeadlineRules)[] = [
  "normalDays",
  "lifeLibertyHours",
  "firstAppealDays",
  "secondAppealDays",
  "faaDisposalDays",
  "faaDisposalMaxDays",
  "dueSoonDays",
  "criticalOverdueDays",
];

export async function updateDeadlineRules(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(["ADMIN"]);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }

  const value = {} as DeadlineRules;
  for (const k of KEYS) {
    const n = Number(formData.get(k));
    value[k] = Number.isFinite(n) && n > 0 ? Math.round(n) : DEFAULT_DEADLINE_RULES[k];
  }

  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").upsert(
    {
      key: DEADLINE_RULES_KEY,
      value,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) return { error: error.message };

  revalidatePath("/rti/settings");
  revalidatePath("/rti");
  revalidatePath("/rti/all");
  return { success: true };
}

export async function updateComplaintSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let user;
  try {
    user = await requireRole(["ADMIN"]);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }

  const num = (k: string, d: number) => {
    const n = Number(formData.get(k));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : d;
  };
  const str = (k: string, d: string) => {
    const v = (formData.get(k) as string)?.trim();
    return v || d;
  };
  const bool = (k: string) => formData.get(k) === "on" || formData.get(k) === "true";

  const value: ComplaintSettings = {
    caseNumberPrefix: str("caseNumberPrefix", DEFAULT_COMPLAINT_SETTINGS.caseNumberPrefix),
    startingSequence: num("startingSequence", DEFAULT_COMPLAINT_SETTINGS.startingSequence),
    followUpDaysAfterFiling: num("followUpDaysAfterFiling", DEFAULT_COMPLAINT_SETTINGS.followUpDaysAfterFiling),
    followUpDaysAfterReply: num("followUpDaysAfterReply", DEFAULT_COMPLAINT_SETTINGS.followUpDaysAfterReply),
    siteVerificationDaysAfterAction: num("siteVerificationDaysAfterAction", DEFAULT_COMPLAINT_SETTINGS.siteVerificationDaysAfterAction),
    ocrLanguage: str("ocrLanguage", DEFAULT_COMPLAINT_SETTINGS.ocrLanguage),
    ocrAutoRun: bool("ocrAutoRun"),
    aiAutoSummary: bool("aiAutoSummary"),
    maxUploadMb: num("maxUploadMb", DEFAULT_COMPLAINT_SETTINGS.maxUploadMb),
    documentsPrivateByDefault: bool("documentsPrivateByDefault"),
    aiAdvisorEnabled: bool("aiAdvisorEnabled"),
    aiAdvisorReminderSlaDays: num("aiAdvisorReminderSlaDays", DEFAULT_COMPLAINT_SETTINGS.aiAdvisorReminderSlaDays),
    aiAdvisorEscalationSlaDays: num("aiAdvisorEscalationSlaDays", DEFAULT_COMPLAINT_SETTINGS.aiAdvisorEscalationSlaDays),
  };

  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").upsert(
    { key: COMPLAINT_SETTINGS_KEY, value, updated_by: user.id, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
  if (error) return { error: error.message };
  revalidatePath("/complaints/settings");
  return { success: true };
}
