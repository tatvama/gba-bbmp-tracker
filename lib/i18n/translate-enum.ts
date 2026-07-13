import type { Locale } from "./types";
import { translate } from "./translate";

/**
 * DISPLAY-ONLY translation for a system-defined enum value (complaint
 * status, complaint type, priority, RTI status/category, designation, etc.).
 *
 * The dictionary KEY is the exact, unmodified enum value as it exists in
 * lib/constants.ts / the database (e.g. "Draft", "Reply Received",
 * "Assistant Executive Engineer") — never invent a new key for these. The
 * VALUE is the localized label shown to the user.
 *
 * CONTRACT: this function only ever changes what is RENDERED. It must never
 * be used to alter what is stored, compared, sent to an API, or matched
 * against a CHECK constraint — callers keep using the raw English constant
 * (e.g. COMPLAINT_STATUSES, RTI_STATUSES) for all logic, filtering, and
 * persistence, and reach for this only at the point of display.
 *
 * Falls back to the raw value itself if no translation is registered yet —
 * an untranslated enum value is never worse than showing the English label.
 */
export function translateEnum(namespace: string, value: string | null | undefined, locale: Locale): string {
  if (!value) return "";
  return translate(namespace, value, locale);
}
