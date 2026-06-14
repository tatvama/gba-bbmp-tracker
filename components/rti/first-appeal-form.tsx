"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiDraftPanel } from "@/components/rti/ai-draft-panel";
import { FIRST_APPEAL_GROUNDS } from "@/lib/constants";
import { generateFirstAppealDraft } from "@/lib/actions/ai";
import type { ActionState } from "@/lib/actions/contacts";
import type { RtiWithRelations } from "@/lib/types";

export function FirstAppealForm({
  rti,
  action,
  aiConfigured,
}: {
  rti: RtiWithRelations;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, {});
  const [grounds, setGrounds] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (state.success) router.push(`/rti/${rti.id}`);
  }, [state, rti.id, router]);

  function toggle(g: string, checked: boolean) {
    setGrounds((prev) => (checked ? [...prev, g] : prev.filter((x) => x !== g)));
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appeal record</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            {state.error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {state.error}
              </div>
            )}

            <div>
              <Label className="mb-1.5 block">Grounds of appeal</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {FIRST_APPEAL_GROUNDS.map((g) => (
                  <label key={g} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      name="grounds"
                      value={g}
                      checked={grounds.includes(g)}
                      onCheckedChange={(c) => toggle(g, c === true)}
                    />
                    {g}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Grounds detail</Label>
              <Textarea name="groundsDetail" rows={2} placeholder="Any specifics to add to the grounds above." />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>FAA name</Label>
                <Input name="faaName" defaultValue={rti.faa_name ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label>FAA designation</Label>
                <Input name="faaDesignation" defaultValue={rti.faa_designation ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label>Date drafted</Label>
                <Input type="date" name="dateDrafted" />
              </div>
              <div className="space-y-1.5">
                <Label>Date filed</Label>
                <Input type="date" name="dateFiled" />
              </div>
              <div className="space-y-1.5">
                <Label>FAA order date</Label>
                <Input type="date" name="faaOrderDate" />
              </div>
              <div className="space-y-1.5">
                <Label>Decision summary</Label>
                <Input name="decisionSummary" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea name="notes" rows={2} />
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save first appeal"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI first-appeal draft</CardTitle>
        </CardHeader>
        <CardContent>
          <AiDraftPanel
            aiConfigured={aiConfigured}
            entityType="rti"
            entityId={rti.id}
            kind="first_appeal"
            generate={() =>
              generateFirstAppealDraft({
                subject: rti.subject,
                rtiRef: rti.internal_ref,
                dateFiled: rti.date_filed,
                replySummary: rti.reply_summary,
                grounds,
                faaName: rti.faa_name,
              })
            }
            inputs={
              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">Context sent to AI</p>
                <p className="mt-1">RTI: {rti.subject}</p>
                <p>Ref: {rti.internal_ref ?? "—"}</p>
                <p className="mt-1">
                  Grounds: {grounds.length ? grounds.join(", ") : "none selected yet"}
                </p>
              </div>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
