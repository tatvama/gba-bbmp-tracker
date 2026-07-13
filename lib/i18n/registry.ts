import type { Dictionary, Locale, NamespaceDictionaries } from "./types";

/**
 * The ONE place a translation namespace plugs in — mirrors lib/jobs/registry.ts
 * and lib/sources/registry.ts's self-registration shape used elsewhere in this
 * app: each dictionary file (lib/i18n/dictionaries/<namespace>.ts) calls
 * registerNamespace() at module load; this file never imports dictionary
 * content directly, so adding a namespace never means editing this file.
 */

const namespaces: Partial<Record<string, NamespaceDictionaries>> = {};

export function registerNamespace(name: string, dictionaries: NamespaceDictionaries): void {
  namespaces[name] = dictionaries;
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
