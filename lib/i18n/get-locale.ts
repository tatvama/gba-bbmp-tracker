import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "./types";

/** Cookie name the language toggle reads/writes. Not httpOnly — the client
 *  provider mirrors this same cookie so it can hydrate without a server
 *  round-trip on first paint. */
export const LOCALE_COOKIE = "gba_locale";

/** Current UI locale for this request (Server Components, Route Handlers,
 *  Server Actions). Defaults to English when unset/invalid — never throws. */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE)?.value;
  return (LOCALES as readonly string[]).includes(raw ?? "") ? (raw as Locale) : DEFAULT_LOCALE;
}
