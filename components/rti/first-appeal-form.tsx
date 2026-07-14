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
import { useTranslation } from "@/lib/i18n/client";
import { translateEnum } from "@/lib/i18n/translate-enum";

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
  const { t, locale } = useTranslation("rti");
  const { t: tc } = useTranslation("common");

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
          <CardTitle className="text-base">{t("form.appealRecordTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            {state.error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {state.error}
              </div>
            )}

            <div>
              <Label className="mb-1.5 block">{t("form.groundsOfAppealLabel")}</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {FIRST_APPEAL_GROUNDS.map((g) => (
                  <label key={g} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      name="grounds"
                      value={g}
                      checked={grounds.includes(g)}
                      onCheckedChange={(c) => toggle(g, c === true)}
                    />
                    {translateEnum("workflow", g, locale)}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t("form.groundsDetailLabel")}</Label>
              <Textarea name="groundsDetail" rows={2} placeholder={t("form.groundsDetailPlaceholder")} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("field.faaName")}</Label>
                <Input name="faaName" defaultValue={rti.faa_name ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("field.faaDesignation")}</Label>
                <Input name="faaDesignation" defaultValue={rti.faa_designation ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("form.dateDrafted")}</Label>
                <Input type="date" name="dateDrafted" />
              </div>
              <div className="space-y-1.5">
                <Label>{t("field.dateFiled")}</Label>
                <Input type="date" name="dateFiled" />
              </div>
              <div className="space-y-1.5">
                <Label>{t("form.faaOrderDate")}</Label>
                <Input type="date" name="faaOrderDate" />
              </div>
              <div className="space-y-1.5">
                <Label>{t("form.decisionSummary")}</Label>
                <Input name="decisionSummary" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t("form.notesLabel")}</Label>
              <Textarea name="notes" rows={2} />
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? t("form.saving") : t("form.saveFirstAppeal")}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                {tc("action.cancel")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("form.aiFirstAppealDraftTitle")}</CardTitle>
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
                <p className="font-semibold text-foreground">{t("form.contextSentToAiLabel")}</p>
                <p className="mt-1">{t("form.rtiSubjectPrefix", { subject: rti.subject })}</p>
                <p>{t("form.refPrefix", { ref: rti.internal_ref ?? "—" })}</p>
                <p className="mt-1">
                  {t("form.groundsPrefix", { grounds: grounds.length ? grounds.join(", ") : t("form.noneSelectedYet") })}
                </p>
              </div>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
