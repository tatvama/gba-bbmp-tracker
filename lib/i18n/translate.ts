import type { Locale } from "./types";
import { getFallbackDictionary, getNamespaceDictionary } from "./registry";

const warnedMissing = new Set<string>();

/** Replace {token} placeholders in a translated string. */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, token) => {
    const v = params[token];
    return v === undefined ? match : String(v);
  });
}

/**
 * Look up `key` in `namespace` for `locale`. Falls back to the English
 * dictionary when the locale-specific translation is missing (keeps rollout
 * safe — a namespace can ship English-complete before Kannada catches up),
 * then to the bare key itself so a missing translation NEVER renders blank
 * or throws. Missing keys are logged once per (namespace, key, locale) in
 * development only, which is what makes translation coverage gaps visible
 * without needing a separate audit pass.
 */
export function translate(
  namespace: string,
  key: string,
  locale: Locale,
  params?: Record<string, string | number>,
): string {
  const dict = getNamespaceDictionary(namespace, locale);
  let value = dict?.[key];

  if (value === undefined && locale !== "en") {
    value = getFallbackDictionary(namespace)?.[key];
  }

  if (value === undefined) {
    const warnKey = `${namespace}.${key}.${locale}`;
    if (process.env.NODE_ENV !== "production" && !warnedMissing.has(warnKey)) {
      warnedMissing.add(warnKey);
      console.warn(`[i18n] missing translation: ${namespace}.${key} (${locale})`);
    }
    value = key;
  }

  return interpolate(value, params);
}
