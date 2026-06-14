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
import { SECOND_APPEAL_REASONS } from "@/lib/constants";
import { generateSecondAppealDraft } from "@/lib/actions/ai";
import type { ActionState } from "@/lib/actions/contacts";
import type { RtiWithRelations, RtiFirstAppeal } from "@/lib/types";

export function SecondAppealForm({
  rti,
  firstAppeals,
  action,
  aiConfigured,
}: {
  rti: RtiWithRelations;
  firstAppeals: RtiFirstAppeal[];
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, {});
  const [reasons, setReasons] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (state.success) router.push(`/rti/${rti.id}`);
  }, [state, rti.id, router]);

  function toggle(r: string, checked: boolean) {
    setReasons((prev) => (checked ? [...prev, r] : prev.filter((x) => x !== r)));
  }

  const latestFa = firstAppeals[0];
  const firstAppealSummary = latestFa
    ? `Grounds: ${latestFa.grounds.join(", ") || "—"}. FAA order: ${
        latestFa.decision_summary ?? (latestFa.faa_order_date ? "received" : "no order")
      }.`
    : "No first appeal on record.";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Second appeal / complaint record</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            {state.error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {state.error}
              </div>
            )}

            <div>
              <Label className="mb-1.5 block">Reasons</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {SECOND_APPEAL_REASONS.map((r) => (
                  <label key={r} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      name="reason"
                      value={r}
                      checked={reasons.includes(r)}
                      onCheckedChange={(c) => toggle(r, c === true)}
                    />
                    {r}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Linked first appeal</Label>
                <select name="firstAppealId" defaultValue={latestFa?.id ?? ""} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option value="">—</option>
                  {firstAppeals.map((fa) => (
                    <option key={fa.id} value={fa.id}>
                      {fa.date_filed ? `Filed ${fa.date_filed}` : "Draft"} · {fa.grounds.join(", ").slice(0, 40)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Commission</Label>
                <Input name="commissionName" defaultValue="Karnataka Information Commission" />
              </div>
              <div className="space-y-1.5">
                <Label>Filing date</Label>
                <Input type="date" name="filingDate" />
              </div>
              <div className="space-y-1.5">
                <Label>Diary number</Label>
                <Input name="diaryNumber" />
              </div>
              <div className="space-y-1.5">
                <Label>Hearing date</Label>
                <Input type="date" name="hearingDate" />
              </div>
              <div className="space-y-1.5">
                <Label>Compliance due date</Label>
                <Input type="date" name="complianceDueDate" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Reason detail</Label>
              <Textarea name="reasonDetail" rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea name="notes" rows={2} />
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save second appeal"}
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
          <CardTitle className="text-base">AI second-appeal draft</CardTitle>
        </CardHeader>
        <CardContent>
          <AiDraftPanel
            aiConfigured={aiConfigured}
            entityType="rti"
            entityId={rti.id}
            kind="second_appeal"
            generate={() =>
              generateSecondAppealDraft({
                subject: rti.subject,
                rtiRef: rti.internal_ref,
                firstAppealSummary,
                reasons,
                commissionName: "Karnataka Information Commission",
              })
            }
            inputs={
              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">Context sent to AI</p>
                <p className="mt-1">RTI: {rti.subject}</p>
                <p>Ref: {rti.internal_ref ?? "—"}</p>
                <p className="mt-1">{firstAppealSummary}</p>
                <p className="mt-1">
                  Reasons: {reasons.length ? reasons.join(", ") : "none selected yet"}
                </p>
              </div>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
