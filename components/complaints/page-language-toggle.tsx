"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Per-page English / Kannada toggle for the Case File and Evidence Dossier
 * pages. Independent of the app-wide top-nav locale: it drives a ?lang= query
 * param this page's server component reads to decide whether to render the
 * extracted content in English (AI-translated, cached) or its original Kannada.
 * A plain Link toggle so it works without extra client state and survives print.
 */
export function PageLanguageToggle({ current }: { current: "en" | "kn" }) {
  const pathname = usePathname();
  const params = useSearchParams();

  const href = (lang: "en" | "kn") => {
    const sp = new URLSearchParams(params.toString());
    sp.set("lang", lang);
    return `${pathname}?${sp.toString()}`;
  };

  const opt = (lang: "en" | "kn", label: string) => (
    <Link
      href={href(lang)}
      scroll={false}
      className={cn(
        "px-2.5 py-1 text-xs font-semibold transition-colors",
        current === lang
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-muted",
      )}
      aria-current={current === lang ? "true" : undefined}
    >
      {label}
    </Link>
  );

  return (
    <div className="no-print inline-flex items-center overflow-hidden rounded-lg border">
      <span className="pl-2 pr-1 text-muted-foreground" aria-hidden><Languages className="h-4 w-4" /></span>
      {opt("en", "English")}
      {opt("kn", "ಕನ್ನಡ")}
    </div>
  );
}
