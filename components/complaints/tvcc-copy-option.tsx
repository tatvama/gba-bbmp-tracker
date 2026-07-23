"use client";

import * as React from "react";
import { ShieldCheck } from "lucide-react";
import { TVCC_DIVISION_OPTIONS } from "@/lib/distribution/tvcc";
import type { CorporationCode, DraftLanguage } from "@/lib/constants";

const selectCls =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** The three language options offered for letters — reused for the TVCC copy. */
export const TVCC_LANGUAGE_OPTIONS: { value: DraftLanguage; label: string }[] = [
  { value: "Kannada", label: "ಕನ್ನಡ (Kannada)" },
  { value: "English", label: "English" },
  { value: "Bilingual", label: "Bilingual (English + ಕನ್ನಡ)" },
];

/** A plain division `<select>` (the 5 GBA corporations) for the TVCC copy. */
export function TvccDivisionSelect({
  value,
  onChange,
  className,
}: {
  value: CorporationCode | null;
  onChange: (code: CorporationCode | null) => void;
  className?: string;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? (e.target.value as CorporationCode) : null)}
      className={className ?? selectCls}
    >
      <option value="">Select division…</option>
      {TVCC_DIVISION_OPTIONS.map((o) => (
        <option key={o.code} value={o.code}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** A plain language `<select>` (English / Kannada / Bilingual) for the TVCC copy. */
export function TvccLanguageSelect({
  value,
  onChange,
  className,
}: {
  value: DraftLanguage;
  onChange: (language: DraftLanguage) => void;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as DraftLanguage)}
      className={className ?? selectCls}
    >
      {TVCC_LANGUAGE_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export interface TvccCopySelection {
  /** null when the copy is not requested (option off / division unset). */
  division: CorporationCode | null;
  /** Language of the TVCC addressee block — mirrors the letter language choice. */
  language: DraftLanguage;
}

/**
 * Opt-in control shown beside the recipient selector when filing a follow-up
 * letter (counter-reply / reminder / legal notice / escalation): tick it to also
 * prepare a separate copy re-addressed to a division's TVCC, and pick the
 * language just like the letter itself. Reports `{ division, language }` via
 * `onChange` (division null when off / unset) — the parent passes them as
 * `tvccDivision` / `tvccLanguage` to the file action.
 */
export function TvccCopyOption({
  defaultDivision,
  defaultLanguage = "Kannada",
  onChange,
  className,
}: {
  defaultDivision: CorporationCode | null;
  defaultLanguage?: DraftLanguage;
  onChange: (selection: TvccCopySelection) => void;
  className?: string;
}) {
  const [enabled, setEnabled] = React.useState(false);
  const [division, setDivision] = React.useState<CorporationCode | null>(defaultDivision);
  const [language, setLanguage] = React.useState<DraftLanguage>(defaultLanguage);

  // Adopt a late-arriving default (the complaint's known corporation) only while
  // the user hasn't picked one yet.
  React.useEffect(() => {
    setDivision((d) => d ?? defaultDivision);
  }, [defaultDivision]);

  React.useEffect(() => {
    onChange({ division: enabled ? division : null, language });
  }, [enabled, division, language, onChange]);

  const selectedLabel = division ? TVCC_DIVISION_OPTIONS.find((o) => o.code === division)?.label : null;

  return (
    <div className={`rounded-lg border bg-card p-3 text-sm ${className ?? ""}`}>
      <label className="flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span>
          <span className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
            <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
            Also prepare a separate copy for the TVCC
          </span>
          <span className="text-xs text-muted-foreground">
            A re-addressed copy of this letter to the Technical Vigilance &amp; Control Cell (Executive Engineer).
          </span>
        </span>
      </label>

      {enabled && (
        <div className="mt-2.5 grid gap-2 pl-6 sm:grid-cols-2">
          <div className="space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Division</span>
            <TvccDivisionSelect value={division} onChange={setDivision} />
          </div>
          <div className="space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Language</span>
            <TvccLanguageSelect value={language} onChange={setLanguage} />
          </div>
          <p className="sm:col-span-2 text-xs text-muted-foreground">
            {selectedLabel
              ? `Addressed to: The Executive Engineer, T.V.C.C., ${selectedLabel} City Corporation.`
              : "Choose the division to address the copy to."}
          </p>
        </div>
      )}
    </div>
  );
}
