"use server";

import { cookies } from "next/headers";
import { LOCALES, type Locale } from "./types";
import { LOCALE_COOKIE } from "./get-locale";

/** Persist the chosen UI language. One year, readable client-side (the
 *  LanguageProvider mirrors it in state) so both Server and Client
 *  Components agree on locale without a flash of the wrong language. */
export async function setLocaleAction(locale: Locale): Promise<void> {
  if (!(LOCALES as readonly string[]).includes(locale)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
