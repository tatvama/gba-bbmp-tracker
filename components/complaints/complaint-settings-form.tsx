"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CASE_NUMBER_PREFIXES, type ComplaintSettings } from "@/lib/constants";
import { updateComplaintSettings } from "@/lib/actions/settings";
import type { ActionState } from "@/lib/actions/contacts";

const selectCls = "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ComplaintSettingsForm({ initial }: { initial: ComplaintSettings }) {
  const [state, action, pending] = useActionState(updateComplaintSettings, {} as ActionState);
  return (
    <form action={action} className="space-y-5">
      {state.error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{state.error}</div>}
      {state.success && <div className="flex items-center gap-2 rounded-md border border-teal/40 bg-teal/5 p-3 text-sm text-teal"><Check className="h-4 w-4" /> Saved.</div>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Internal case number prefix</Label>
          <Input name="caseNumberPrefix" defaultValue={initial.caseNumberPrefix} list="prefixes" />
          <datalist id="prefixes">{CASE_NUMBER_PREFIXES.map((p) => <option key={p} value={p === "CUSTOM" ? "" : p} />)}</datalist>
          <p className="text-xs text-muted-foreground">e.g. DM-CMP → DM-CMP-2026-000001</p>
        </div>
        <Num name="startingSequence" label="Starting sequence" value={initial.startingSequence} />
        <Num name="followUpDaysAfterFiling" label="Follow-up days after filing" value={initial.followUpDaysAfterFiling} />
        <Num name="followUpDaysAfterReply" label="Follow-up days after reply" value={initial.followUpDaysAfterReply} />
        <Num name="siteVerificationDaysAfterAction" label="Site verification days after action" value={initial.siteVerificationDaysAfterAction} />
        <Num name="maxUploadMb" label="Max upload size (MB)" value={initial.maxUploadMb} />
        <div className="space-y-1.5">
          <Label>OCR default language</Label>
          <select name="ocrLanguage" defaultValue={initial.ocrLanguage} className={selectCls}>
            <option value="eng">English (eng)</option>
            <option value="kan">Kannada (kan)</option>
            <option value="eng+kan">English + Kannada (eng+kan)</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm"><Checkbox name="ocrAutoRun" defaultChecked={initial.ocrAutoRun} /> Run OCR automatically on upload</label>
        <label className="flex items-center gap-2 text-sm"><Checkbox name="aiAutoSummary" defaultChecked={initial.aiAutoSummary} /> Run AI summary automatically after OCR</label>
        <label className="flex items-center gap-2 text-sm"><Checkbox name="documentsPrivateByDefault" defaultChecked={initial.documentsPrivateByDefault} /> Keep documents private by default</label>
      </div>

      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save settings"}</Button>
    </form>
  );
}

function Num({ name, label, value }: { name: string; label: string; value: number }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="number" min={1} name={name} defaultValue={value} required />
    </div>
  );
}
