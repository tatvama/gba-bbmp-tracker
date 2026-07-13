import "server-only";
import { getLocale } from "./get-locale";
import { translate } from "./translate";
import type { Locale } from "./types";
// Side-effect import: registers every dictionary namespace. See the matching
// comment in ./client.tsx — a Server Component calling getTranslations()
// must not depend on some OTHER module having imported the dictionaries first.
import "./dictionaries";

/** Server Component translation helper, bound to one namespace. Mirrors
 *  useTranslation()'s shape so a component moving between server/client
 *  doesn't need its translation call sites rewritten.
 *
 *    const { t } = await getTranslations("complaints");
 *    <h1>{t("detail.title")}</h1>
 */
export async function getTranslations(namespace: string): Promise<{ t: (key: string, params?: Record<string, string | number>) => string; locale: Locale }> {
  const locale = await getLocale();
  return { t: (key, params) => translate(namespace, key, locale, params), locale };
}
