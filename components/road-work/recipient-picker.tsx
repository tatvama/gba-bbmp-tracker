"use client";

import * as React from "react";
import { Plus, X, Wand2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ESCALATION_CHAIN,
  ESCALATION_LABEL,
  INSTITUTIONAL_RECIPIENTS,
  type EscalationLevel,
} from "@/lib/constants";
import type { LetterRecipient } from "@/lib/letters/types";
import type { RecipientOfficer } from "@/lib/queries";

const selectCls =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export interface RecipientValue {
  recipient: LetterRecipient;
  ccChain: LetterRecipient[];
}

function officerToRecipient(o: RecipientOfficer): LetterRecipient {
  const office = [o.eng_subdivision, o.division, o.corporation].filter(Boolean).join(", ") || "BBMP / GBA";
  return { name: o.full_name, designation: o.designation, office, address: o.office_address };
}

/** "To Whom" — primary recipient + auto-suggested copy/escalation chain. */
export function RecipientPicker({
  officers,
  outputType,
  division,
  value,
  onChange,
}: {
  officers: RecipientOfficer[];
  outputType: "rti" | "complaint";
  division?: string | null;
  value: RecipientValue;
  onChange: (v: RecipientValue) => void;
}) {
  const byLevel = React.useMemo(() => {
    const m = new Map<string, RecipientOfficer[]>();
    for (const o of officers) {
      const k = o.role_level ?? "Other";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(o);
    }
    return m;
  }, [officers]);

  function setRecipient(patch: Partial<LetterRecipient>) {
    onChange({ ...value, recipient: { ...value.recipient, ...patch } });
  }
  function fillFromOfficer(id: string) {
    const o = officers.find((x) => x.id === id);
    if (o) onChange({ ...value, recipient: officerToRecipient(o) });
  }
  function usePioDefault() {
    onChange({
      ...value,
      recipient: {
        name: "Public Information Officer (PIO)",
        designation: "PIO",
        office: division ? `${division}, BBMP / GBA` : "BBMP / GBA",
        address: null,
      },
    });
  }

  function suggestChain() {
    const rows: LetterRecipient[] = [];
    // PDF copy chain: AEE → EE → CE → Commissioner → Lokayukta → ACB.
    for (const level of ESCALATION_CHAIN.filter((l) => l !== "AE") as EscalationLevel[]) {
      if (level === "Lokayukta" || level === "ACB") {
        const inst = INSTITUTIONAL_RECIPIENTS[level];
        rows.push({ name: inst.name, designation: null, office: inst.office, address: null });
        continue;
      }
      const match = byLevel.get(level)?.[0];
      rows.push(match ? officerToRecipient(match) : { name: "", designation: ESCALATION_LABEL[level], office: "", address: null });
    }
    onChange({ ...value, ccChain: rows });
  }

  function setCc(i: number, patch: Partial<LetterRecipient>) {
    const next = value.ccChain.slice();
    next[i] = { ...next[i], ...patch };
    onChange({ ...value, ccChain: next });
  }
  function addCc() {
    onChange({ ...value, ccChain: [...value.ccChain, { name: "", designation: "", office: "", address: null }] });
  }
  function removeCc(i: number) {
    onChange({ ...value, ccChain: value.ccChain.filter((_, j) => j !== i) });
  }

  return (
    <div className="space-y-6">
      {/* Primary recipient */}
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Primary recipient (To Whom)</h3>
          <div className="flex flex-wrap gap-2">
            <select className={`${selectCls} w-auto`} value="" onChange={(e) => e.target.value && fillFromOfficer(e.target.value)}>
              <option value="">Fill from officer…</option>
              {[...byLevel.entries()].map(([level, list]) => (
                <optgroup key={level} label={ESCALATION_LABEL[level as EscalationLevel] ?? level}>
                  {list.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.full_name}{o.designation ? ` — ${o.designation}` : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {outputType === "rti" && (
              <Button type="button" variant="outline" size="sm" onClick={usePioDefault}>
                <Building2 className="h-4 w-4" /> Use PIO default
              </Button>
            )}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="mb-1.5 block text-xs font-medium">Name / office holder</Label>
            <Input value={value.recipient.name ?? ""} onChange={(e) => setRecipient({ name: e.target.value })} placeholder="e.g. Executive Engineer" />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs font-medium">Designation</Label>
            <Input value={value.recipient.designation ?? ""} onChange={(e) => setRecipient({ designation: e.target.value })} placeholder="e.g. EE" />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs font-medium">Office / division</Label>
            <Input value={value.recipient.office ?? ""} onChange={(e) => setRecipient({ office: e.target.value })} placeholder="e.g. South Division, BBMP / GBA" />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs font-medium">Address</Label>
            <Input value={value.recipient.address ?? ""} onChange={(e) => setRecipient({ address: e.target.value })} placeholder="optional" />
          </div>
        </div>
      </div>

      {/* Copy chain */}
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Copy to (escalation chain)</h3>
            <p className="text-xs text-muted-foreground">AEE → EE → CE → Commissioner → Lokayukta → ACB</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={suggestChain}>
            <Wand2 className="h-4 w-4" /> Suggest chain
          </Button>
        </div>
        <div className="space-y-2">
          {value.ccChain.length === 0 && (
            <p className="text-xs text-muted-foreground">No copy recipients yet — use “Suggest chain” or add a row.</p>
          )}
          {value.ccChain.map((r, i) => (
            <div key={i} className="grid gap-2 rounded-md border bg-background p-2 sm:grid-cols-[1fr_1fr_1.4fr_auto]">
              <Input value={r.name ?? ""} onChange={(e) => setCc(i, { name: e.target.value })} placeholder="Name / office" className="h-9" />
              <Input value={r.designation ?? ""} onChange={(e) => setCc(i, { designation: e.target.value })} placeholder="Designation" className="h-9" />
              <Input value={r.office ?? ""} onChange={(e) => setCc(i, { office: e.target.value })} placeholder="Office" className="h-9" />
              <Button type="button" variant="ghost" size="icon" onClick={() => removeCc(i)} aria-label="Remove">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addCc}>
            <Plus className="h-4 w-4" /> Add copy recipient
          </Button>
        </div>
      </div>
    </div>
  );
}
