"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "./types";
import { DEFAULT_LOCALE } from "./types";
import { translate } from "./translate";
import { setLocaleAction } from "./set-locale";
// Side-effect import: registers every dictionary namespace. Every component
// that needs translations imports useTranslation/useLocale from THIS file
// (not necessarily the lib/i18n barrel), so registration has to happen here
// too, not only in lib/i18n/index.ts — otherwise the registry is empty and
// every lookup silently falls through to "missing translation".
import "./dictionaries";

interface LanguageContextValue {
  locale: Locale;
  /** Persists the cookie, updates local state immediately (client components
   *  re-render with no delay), then router.refresh() so already-rendered
   *  Server Components re-render with the new locale too — no full reload,
   *  no app restart, matches this app's dark-mode-toggle UX conventions. */
  setLocale: (locale: Locale) => void;
  /** True while a setLocale() is in flight (router.refresh() pending). */
  isChanging: boolean;
}

const LanguageContext = React.createContext<LanguageContextValue | null>(null);

/** Wraps the app (app/layout.tsx). `initialLocale` comes from the server
 *  (getLocale() reading the cookie) so first paint already matches — no
 *  language flash on load. */
export function LanguageProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = React.useState<Locale>(initialLocale);
  const [isChanging, startTransition] = React.useTransition();

  // Keep client state in sync if the server ever disagrees (e.g. cookie
  // cleared, or navigation restored a stale initialLocale prop).
  React.useEffect(() => {
    setLocaleState(initialLocale);
  }, [initialLocale]);

  const setLocale = React.useCallback(
    (next: Locale) => {
      setLocaleState(next);
      startTransition(() => {
        void setLocaleAction(next).then(() => router.refresh());
      });
    },
    [router],
  );

  const value = React.useMemo(() => ({ locale, setLocale, isChanging }), [locale, setLocale, isChanging]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLocale(): LanguageContextValue {
  const ctx = React.useContext(LanguageContext);
  // A component rendered outside the provider (shouldn't happen once wired
  // into app/layout.tsx) still works, just can't change the language.
  if (!ctx) return { locale: DEFAULT_LOCALE, setLocale: () => {}, isChanging: false };
  return ctx;
}

/** Client Component translation hook, bound to one namespace. */
export function useTranslation(namespace: string) {
  const { locale } = useLocale();
  const t = React.useCallback(
    (key: string, params?: Record<string, string | number>) => translate(namespace, key, locale, params),
    [namespace, locale],
  );
  return { t, locale };
}
