import type { Dictionary, Locale, NamespaceDictionaries } from "./types";

/**
 * The ONE place a translation namespace plugs in — mirrors lib/jobs/registry.ts
 * and lib/sources/registry.ts's self-registration shape used elsewhere in this
 * app: each dictionary file (lib/i18n/dictionaries/<namespace>.ts) calls
 * registerNamespace() at module load; this file never imports dictionary
 * content directly, so adding a namespace never means editing this file.
 *
 * MERGES on repeat calls for the same namespace name — a large module (e.g.
 * "complaints") can be split across several dictionary files (complaints-
 * list.ts, complaints-detail.ts, complaints-forms.ts, ...) that each own a
 * disjoint set of keys, so they can be edited/generated independently without
 * clobbering each other, while still presenting as one namespace to callers.
 * A duplicate key across two files is a real bug (last-registered file wins,
 * silently) — keep each file's key set disjoint by convention.
 */

const namespaces: Partial<Record<string, NamespaceDictionaries>> = {};

export function registerNamespace(name: string, dictionaries: NamespaceDictionaries): void {
  const existing = namespaces[name];
  namespaces[name] = existing
    ? {
        en: { ...existing.en, ...dictionaries.en },
        kn: { ...existing.kn, ...dictionaries.kn },
      }
    : dictionaries;
}

export function getNamespaceDictionary(name: string, locale: Locale): Dictionary | undefined {
  return namespaces[name]?.[locale];
}

/** English is the authoritative fallback dictionary for a namespace — every
 *  key MUST exist in en; kn may lag during rollout without breaking display. */
export function getFallbackDictionary(name: string): Dictionary | undefined {
  return namespaces[name]?.en;
}

export function allNamespaces(): string[] {
  return Object.keys(namespaces);
}
