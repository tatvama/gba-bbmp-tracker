/**
 * Barrel for the i18n system. Import from "@/lib/i18n" in most call sites;
 * reach into the individual files only when you need something narrower
 * (e.g. "@/lib/i18n/server" alone in a server-only module to avoid pulling
 * in client-provider code).
 */
export { LOCALES, DEFAULT_LOCALE, LOCALE_LABEL, type Locale, type Dictionary } from "./types";
export { getLocale, LOCALE_COOKIE } from "./get-locale";
export { setLocaleAction } from "./set-locale";
export { LanguageProvider, useLocale, useTranslation } from "./client";
export { getTranslations } from "./server";
export { translateEnum } from "./translate-enum";
export { registerNamespace } from "./registry";

// Side-effect import: registers every dictionary namespace at module load,
// exactly like lib/jobs/handlers/index.ts / lib/sources/adapters/index.ts.
import "./dictionaries";
