"use client";

import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/client";
import { LOCALE_LABEL } from "@/lib/i18n/types";

/** App-wide English <-> Kannada toggle. Mirrors ModeToggle's shape/placement
 *  (same icon-button pattern already used for the dark-mode toggle in TopNav). */
export function LanguageSwitcher() {
  const { locale, setLocale, isChanging } = useLocale();
  const next = locale === "en" ? "kn" : "en";

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={`Switch to ${LOCALE_LABEL[next]}`}
      disabled={isChanging}
      onClick={() => setLocale(next)}
      className="gap-1.5 px-2.5 font-semibold"
    >
      <Languages className="h-4 w-4" />
      <span className="text-xs">{locale === "en" ? "EN" : "ಕನ್ನಡ"}</span>
    </Button>
  );
}
