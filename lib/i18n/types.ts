/**
 * Application-wide English <-> Kannada UI translation. Framework-free types
 * shared by both server (lib/i18n/server.ts) and client (lib/i18n/client.tsx)
 * entry points, so neither has to import the other.
 *
 * SCOPE: this system translates STATIC UI CHROME ONLY — labels, buttons,
 * headings, table headers, validation/empty-state copy, and the DISPLAY
 * label for system-defined enum values (status/type/priority/category).
 * It NEVER touches: AI-generated content, user-entered free text, database
 * enum/identifier values, or API payloads — those are rendered verbatim
 * regardless of locale. See lib/i18n/translate-enum.ts for the enum-display
 * layer and its explicit "display label only, never the stored value" rule.
 */

export const LOCALES = ["en", "kn"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  kn: "ಕನ್ನಡ",
};

/** A dictionary namespace: flat key -> translated string. Nested objects are
 *  intentionally NOT supported (flat keys keep lookup/fallback trivial and
 *  make "missing key" detection a simple presence check). Interpolation uses
 *  {placeholder} tokens, substituted by lib/i18n's translate().  */
export type Dictionary = Record<string, string>;

/** One dictionary per locale for a given namespace (e.g. "complaints"). */
export type NamespaceDictionaries = Record<Locale, Dictionary>;
