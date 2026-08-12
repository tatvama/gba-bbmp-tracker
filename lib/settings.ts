import "server-only";
import { createClient } from "@/lib/db";
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
  DEFAULT_DEPT_LETTER_SENDER,
  type DeptLetterSender,
  type CorporationCode,
} from "@/lib/constants";
import { mergeTvccOffices, DEFAULT_TVCC_SENDER, type TvccOffice, type TvccSender } from "@/lib/distribution/tvcc";

export const DEADLINE_RULES_KEY = "rti_deadline_rules";
export const COMPLAINT_SETTINGS_KEY = "complaint_settings";
export const PHOTO_DEDUPE_RULES_KEY = "photo_dedupe_rules";
export const FORENSICS_RULES_KEY = "forensics_rules";
export const LEGAL_NOTICE_SENDER_KEY = "legal_notice_sender";
export const DEPT_LETTER_SENDER_KEY = "dept_letter_sender";
export const TVCC_OFFICES_KEY = "tvcc_offices";
export const TVCC_SENDER_KEY = "tvcc_sender";

/**
 * Read the configurable RTI deadline rules from app_settings, falling back to the
 * statutory defaults when the row is missing or the DB is unreachable. Merges so a
 * partial row still yields a complete rule set.
 */
export async function getDeadlineRules(): Promise<DeadlineRules> {
  try {
    const db = await createClient();
    const { data } = await db
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
    const db = await createClient();
    const { data } = await db
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
    const db = await createClient();
    const { data } = await db
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
    const db = await createClient();
    const { data } = await db
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

/**
 * Read the saved default sender for a department-facing letter (counter-reply,
 * reminder letter), merged over defaults. Used to pre-fill the sender-details
 * form shown before those letters are drafted — see lib/ai/complaint-draft.ts's
 * `senderOverride`.
 */
export async function getDeptLetterSender(): Promise<DeptLetterSender> {
  try {
    const db = await createClient();
    const { data } = await db
      .from("app_settings")
      .select("value")
      .eq("key", DEPT_LETTER_SENDER_KEY)
      .maybeSingle();
    const value = (data?.value ?? {}) as Partial<DeptLetterSender>;
    return { ...DEFAULT_DEPT_LETTER_SENDER, ...value };
  } catch {
    return DEFAULT_DEPT_LETTER_SENDER;
  }
}

/**
 * Read the TVCC office addresses — the user's saved per-division edits overlaid
 * on the hardcoded seed (mergeTvccOffices guarantees a complete, usable map even
 * when nothing is saved or the DB is unreachable). Used to pre-fill the editable
 * dialog and to render the addressee on a filed TVCC copy.
 */
export async function getTvccOffices(): Promise<Record<CorporationCode, TvccOffice>> {
  try {
    const db = await createClient();
    const { data } = await db
      .from("app_settings")
      .select("value")
      .eq("key", TVCC_OFFICES_KEY)
      .maybeSingle();
    const saved = (data?.value ?? {}) as Partial<Record<CorporationCode, Partial<TvccOffice>>>;
    return mergeTvccOffices(saved);
  } catch {
    return mergeTvccOffices();
  }
}

/** Read the saved default FROM / signatory for a TVCC complaint copy, merged
 *  over the seed default. Pre-fills the "from address" fields in the copy dialog. */
export async function getTvccSender(): Promise<TvccSender> {
  try {
    const db = await createClient();
    const { data } = await db
      .from("app_settings")
      .select("value")
      .eq("key", TVCC_SENDER_KEY)
      .maybeSingle();
    const value = (data?.value ?? {}) as Partial<TvccSender>;
    return { ...DEFAULT_TVCC_SENDER, ...value };
  } catch {
    return DEFAULT_TVCC_SENDER;
  }
}

/** Read forensics thresholds (geofence radius, etc.), merged over defaults. */
export async function getForensicsRules(): Promise<ForensicsRules> {
  try {
    const db = await createClient();
    const { data } = await db
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
