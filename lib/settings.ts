import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_DEADLINE_RULES,
  type DeadlineRules,
  DEFAULT_COMPLAINT_SETTINGS,
  type ComplaintSettings,
  DEFAULT_PHOTO_DEDUPE_RULES,
  type PhotoDedupeRules,
  DEFAULT_FORENSICS_RULES,
  type ForensicsRules,
  DEFAULT_LEGAL_NOTICE_SENDER,
  type LegalNoticeSender,
} from "@/lib/constants";

export const DEADLINE_RULES_KEY = "rti_deadline_rules";
export const COMPLAINT_SETTINGS_KEY = "complaint_settings";
export const PHOTO_DEDUPE_RULES_KEY = "photo_dedupe_rules";
export const FORENSICS_RULES_KEY = "forensics_rules";
export const LEGAL_NOTICE_SENDER_KEY = "legal_notice_sender";

/**
 * Read the configurable RTI deadline rules from app_settings, falling back to the
 * statutory defaults when the row is missing or the DB is unreachable. Merges so a
 * partial row still yields a complete rule set.
 */
export async function getDeadlineRules(): Promise<DeadlineRules> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", DEADLINE_RULES_KEY)
      .maybeSingle();
    const value = (data?.value ?? {}) as Partial<DeadlineRules>;
    return { ...DEFAULT_DEADLINE_RULES, ...value };
  } catch {
    return DEFAULT_DEADLINE_RULES;
  }
}

/**
 * Read the complaint module settings (case-number prefix, follow-up rules, OCR
 * language, upload limits) from app_settings, merged over the defaults.
 */
export async function getComplaintSettings(): Promise<ComplaintSettings> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", COMPLAINT_SETTINGS_KEY)
      .maybeSingle();
    const value = (data?.value ?? {}) as Partial<ComplaintSettings>;
    return { ...DEFAULT_COMPLAINT_SETTINGS, ...value };
  } catch {
    return DEFAULT_COMPLAINT_SETTINGS;
  }
}

/** Read the configurable duplicate-photo detection thresholds, merged over defaults. */
export async function getPhotoDedupeRules(): Promise<PhotoDedupeRules> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", PHOTO_DEDUPE_RULES_KEY)
      .maybeSingle();
    const value = (data?.value ?? {}) as Partial<PhotoDedupeRules>;
    return { ...DEFAULT_PHOTO_DEDUPE_RULES, ...value };
  } catch {
    return DEFAULT_PHOTO_DEDUPE_RULES;
  }
}

/**
 * Read the saved default legal-notice sender (petitioner identity for the PIL
 * letter to the Hon'ble Chief Justice) from app_settings, merged over defaults.
 * Used to pre-fill the From-details form; the request-free escalation scheduler
 * reads app_settings directly via the admin client instead (next/headers must
 * not load there) — see lib/ai/complaint-draft.ts.
 */
export async function getLegalNoticeSender(): Promise<LegalNoticeSender> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", LEGAL_NOTICE_SENDER_KEY)
      .maybeSingle();
    const value = (data?.value ?? {}) as Partial<LegalNoticeSender>;
    return { ...DEFAULT_LEGAL_NOTICE_SENDER, ...value };
  } catch {
    return DEFAULT_LEGAL_NOTICE_SENDER;
  }
}

/** Read forensics thresholds (geofence radius, etc.), merged over defaults. */
export async function getForensicsRules(): Promise<ForensicsRules> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", FORENSICS_RULES_KEY)
      .maybeSingle();
    const value = (data?.value ?? {}) as Partial<ForensicsRules>;
    return { ...DEFAULT_FORENSICS_RULES, ...value };
  } catch {
    return DEFAULT_FORENSICS_RULES;
  }
}
