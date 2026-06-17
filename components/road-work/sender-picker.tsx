"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LETTER_SIGNATORIES, type SignatoryKey } from "@/lib/constants";

export interface SenderValue {
  signatoryKey?: SignatoryKey | null;
  name?: string | null;
  address?: string | null;
  mobile?: string | null;
}

const SIGNATORY_KEYS = Object.keys(LETTER_SIGNATORIES) as SignatoryKey[];
const selectCls =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** "From Whom" — pick a saved signatory or enter a new applicant. */
export function SenderPicker({ value, onChange }: { value: SenderValue; onChange: (v: SenderValue) => void }) {
  const isCustom = !value.signatoryKey;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="sender-mode"
            checked={!isCustom}
            onChange={() => onChange({ signatoryKey: SIGNATORY_KEYS[0] })}
          />
          Use a saved signatory
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="sender-mode"
            checked={isCustom}
            onChange={() => onChange({ signatoryKey: null, name: "", address: "", mobile: "" })}
          />
          New applicant
        </label>
      </div>

      {!isCustom ? (
        <div>
          <Label className="mb-1.5 block text-sm font-medium">Signatory</Label>
          <select
            className={selectCls}
            value={value.signatoryKey ?? ""}
            onChange={(e) => onChange({ signatoryKey: e.target.value as SignatoryKey })}
          >
            {SIGNATORY_KEYS.map((k) => (
              <option key={k} value={k}>
                {LETTER_SIGNATORIES[k].name}
              </option>
            ))}
          </select>
          {value.signatoryKey && (
            <p className="mt-2 whitespace-pre-line rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              {LETTER_SIGNATORIES[value.signatoryKey].name}
              {"\n"}
              {LETTER_SIGNATORIES[value.signatoryKey].address}
              {LETTER_SIGNATORIES[value.signatoryKey].mobile ? `\nದೂರವಾಣಿ: ${LETTER_SIGNATORIES[value.signatoryKey].mobile}` : ""}
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="snd-name" className="mb-1.5 block text-sm font-medium">
              Applicant name <span className="text-destructive">*</span>
            </Label>
            <Input id="snd-name" value={value.name ?? ""} onChange={(e) => onChange({ ...value, signatoryKey: null, name: e.target.value })} placeholder="Full name" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="snd-addr" className="mb-1.5 block text-sm font-medium">Address</Label>
            <Input id="snd-addr" value={value.address ?? ""} onChange={(e) => onChange({ ...value, signatoryKey: null, address: e.target.value })} placeholder="Postal address" />
          </div>
          <div>
            <Label htmlFor="snd-phone" className="mb-1.5 block text-sm font-medium">Phone</Label>
            <Input id="snd-phone" value={value.mobile ?? ""} onChange={(e) => onChange({ ...value, signatoryKey: null, mobile: e.target.value })} placeholder="optional" />
          </div>
          <p className="self-end text-xs text-muted-foreground">
            The letter is never signed on behalf of any Trust / Samsthana.
          </p>
        </div>
      )}
    </div>
  );
}
