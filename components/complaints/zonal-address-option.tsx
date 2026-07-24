"use client";

import * as React from "react";
import { Building2 } from "lucide-react";
import { TvccDivisionSelect, TvccLanguageSelect } from "@/components/complaints/tvcc-copy-option";
import { TVCC_OFFICES, TVCC_DIVISION_OPTIONS, corporationOfficeAddress } from "@/lib/distribution/tvcc";
import type { CorporationCode, DraftLanguage } from "@/lib/constants";

export interface ZonalAddressSelection {
  /** null → do not stamp a corporation address (no zonal officer selected / unset). */
  division: CorporationCode | null;
  language: DraftLanguage;
}

/**
 * Shown beside the recipient selector when one or more BBMP zonal officers
 * (Commissioner / Chief Engineer / Executive Engineer / Assistant Executive
 * Engineer) is picked as a Copy-To. The user chooses ONE of the 5 GBA city
 * corporations; that corporation's office address (from the GBA address sheet) is
 * stamped onto every selected zonal officer's Copy-To line, in the chosen
 * language. Reports `{ division, language }` via `onChange` — the parent passes
 * them as `zonalDivision` / `zonalLanguage` to the file action.
 */
export function ZonalAddressOption({
  active,
  defaultDivision,
  defaultLanguage = "Kannada",
  onChange,
  className,
}: {
  /** Whether any corporation-addressed zonal officer is currently selected. */
  active: boolean;
  defaultDivision: CorporationCode | null;
  defaultLanguage?: DraftLanguage;
  onChange: (selection: ZonalAddressSelection) => void;
  className?: string;
}) {
  const [division, setDivision] = React.useState<CorporationCode | null>(defaultDivision);
  const [language, setLanguage] = React.useState<DraftLanguage>(defaultLanguage);

  // Adopt a late-arriving default (the complaint's known corporation) only while
  // the user hasn't picked one yet.
  React.useEffect(() => {
    setDivision((d) => d ?? defaultDivision);
  }, [defaultDivision]);

  React.useEffect(() => {
    onChange({ division: active ? division : null, language });
  }, [active, division, language, onChange]);

  if (!active) return null;

  const address = division ? corporationOfficeAddress(TVCC_OFFICES[division], language) : null;
  const label = division ? TVCC_DIVISION_OPTIONS.find((o) => o.code === division)?.label : null;

  return (
    <div className={`rounded-lg border bg-card p-3 text-sm ${className ?? ""}`}>
      <span className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        Zonal officer address
      </span>
      <span className="text-xs text-muted-foreground">
        The selected BBMP zone &amp; division officers (Commissioner, Chief Engineer, Deputy Controller, Executive &amp; Assistant Executive Engineer) are addressed to this corporation&apos;s office.
      </span>

      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Corporation</span>
          <TvccDivisionSelect value={division} onChange={setDivision} />
        </div>
        <div className="space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Address language</span>
          <TvccLanguageSelect value={language} onChange={setLanguage} />
        </div>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {address ? (
          <>
            Addressed to: <span className="text-slate-600 dark:text-slate-400">{label} City Corporation — {address}</span>
          </>
        ) : (
          "Choose the corporation to address the zonal officers to."
        )}
      </p>
    </div>
  );
}
