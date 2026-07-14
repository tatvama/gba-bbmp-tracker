"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  addComplaintReply,
  addComplaintActionTaken,
  addComplaintCommunication,
  addComplaintEscalation,
  type ActionState,
} from "@/lib/actions/complaints";
import { COMMUNICATION_TYPES } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/client";
import { translateEnum } from "@/lib/i18n/translate-enum";

const selectCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type DocOpt = { id: string; title: string | null };
type OfficerOpt = { id: string; full_name: string; designation: string };

function useFormReset(state: ActionState) {
  const router = useRouter();
  const ref = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => {
    if (state.success) {
      ref.current?.reset();
      router.refresh();
    }
  }, [state, router]);
  return ref;
}

function Err({ state }: { state: ActionState }) {
  return state.error ? (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">{state.error}</div>
  ) : null;
}

export function ReplyForm({ complaintId, documents }: { complaintId: string; documents: DocOpt[] }) {
  const [state, action, pending] = useActionState(addComplaintReply.bind(null, complaintId), {} as ActionState);
  const ref = useFormReset(state);
  const { t } = useTranslation("complaints");
  return (
    <form ref={ref} action={action} className="space-y-3 rounded-lg border p-4">
      <p className="text-sm font-semibold">{t("form.recordAReplyHeading")}</p>
      <Err state={state} />
      <div className="grid gap-3 sm:grid-cols-3">
        <L label={t("form.fieldReplyDate")}><Input type="date" name="replyDate" /></L>
        <L label={t("form.fieldRepliedBy")}><Input name="repliedByName" /></L>
        <L label={t("form.fieldDesignation")}><Input name="repliedByDesignation" /></L>
        <L label={t("form.fieldDepartment")}><Input name="department" /></L>
        <L label={t("form.fieldReplyMode")}><Input name="replyMode" placeholder={t("form.placeholderReplyMode")} /></L>
        <L label={t("form.fieldLinkedDocument")}>
          <select name="documentId" className={selectCls}><option value="">—</option>{documents.map((d) => <option key={d.id} value={d.id}>{d.title ?? d.id.slice(0, 8)}</option>)}</select>
        </L>
      </div>
      <L label={t("form.fieldReplySummary")}><Textarea name="replySummary" rows={2} /></L>
      <L label={t("form.fieldIssuesRemaining")}><Textarea name="issuesRemaining" rows={2} /></L>
      <label className="flex items-center gap-2 text-sm"><Checkbox name="isSatisfactory" /> {t("form.replyIsSatisfactory")}</label>
      <Button type="submit" size="sm" disabled={pending}>{pending ? t("form.saving") : t("form.addReplyButton")}</Button>
    </form>
  );
}

export function ActionForm({ complaintId, documents }: { complaintId: string; documents: DocOpt[] }) {
  const [state, action, pending] = useActionState(addComplaintActionTaken.bind(null, complaintId), {} as ActionState);
  const ref = useFormReset(state);
  const { t } = useTranslation("complaints");
  return (
    <form ref={ref} action={action} className="space-y-3 rounded-lg border p-4">
      <p className="text-sm font-semibold">{t("action.recordActionTaken")}</p>
      <Err state={state} />
      <div className="grid gap-3 sm:grid-cols-3">
        <L label={t("form.fieldActionTakenDate")}><Input type="date" name="actionTakenDate" /></L>
        <L label={t("form.fieldActionBy")}><Input name="actionTakenByName" /></L>
        <L label={t("form.fieldDesignation")}><Input name="actionTakenByDesignation" /></L>
        <L label={t("form.fieldDepartment")}><Input name="department" /></L>
        <L label={t("form.fieldLinkedDocument")}>
          <select name="documentId" className={selectCls}><option value="">—</option>{documents.map((d) => <option key={d.id} value={d.id}>{d.title ?? d.id.slice(0, 8)}</option>)}</select>
        </L>
      </div>
      <L label={t("form.fieldActionSummary")}><Textarea name="actionSummary" rows={2} /></L>
      <L label={t("form.fieldPendingWork")}><Textarea name="pendingWork" rows={2} /></L>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><Checkbox name="workCompleted" /> {t("form.workCompletedLabel")}</label>
        <label className="flex items-center gap-2"><Checkbox name="siteVisited" /> {t("form.siteVisitedLabel")}</label>
        <label className="flex items-center gap-2"><Checkbox name="photoEvidenceAvailable" /> {t("form.photoEvidenceLabel")}</label>
      </div>
      <Button type="submit" size="sm" disabled={pending}>{pending ? t("form.saving") : t("form.addActionTakenButton")}</Button>
    </form>
  );
}

export function CommunicationForm({ complaintId, officers }: { complaintId: string; officers: OfficerOpt[] }) {
  const [state, action, pending] = useActionState(addComplaintCommunication.bind(null, complaintId), {} as ActionState);
  const ref = useFormReset(state);
  const { t, locale } = useTranslation("complaints");
  const { t: tc } = useTranslation("common");
  return (
    <form ref={ref} action={action} className="space-y-3 rounded-lg border p-4">
      <p className="text-sm font-semibold">{t("form.logCommunicationHeading")}</p>
      <Err state={state} />
      <div className="grid gap-3 sm:grid-cols-3">
        <L label={tc("table.type")}>
          <select name="communicationType" className={selectCls} defaultValue="Phone Call">{COMMUNICATION_TYPES.map((ct) => <option key={ct} value={ct}>{translateEnum("workflow", ct, locale)}</option>)}</select>
        </L>
        <L label={tc("table.date")}><Input type="date" name="communicationDate" /></L>
        <L label={t("form.fieldOfficer")}>
          <select name="officerId" className={selectCls}><option value="">—</option>{officers.map((o) => <option key={o.id} value={o.id}>{o.full_name} — {o.designation}</option>)}</select>
        </L>
        <L label={t("form.fieldContactPerson")}><Input name="contactPerson" /></L>
        <L label={t("form.fieldPhoneEmail")}><Input name="phoneOrEmail" /></L>
        <L label={t("form.fieldNextActionDate")}><Input type="date" name="nextActionDate" /></L>
      </div>
      <L label={t("form.fieldSummary")}><Textarea name="summary" rows={2} /></L>
      <L label={t("form.fieldOutcomeNextAction")}><Input name="nextAction" /></L>
      <Button type="submit" size="sm" disabled={pending}>{pending ? t("form.saving") : t("form.addCommunicationButton")}</Button>
    </form>
  );
}

export function EscalationForm({ complaintId }: { complaintId: string }) {
  const [state, action, pending] = useActionState(addComplaintEscalation.bind(null, complaintId), {} as ActionState);
  const ref = useFormReset(state);
  const { t, locale } = useTranslation("complaints");
  return (
    <form ref={ref} action={action} className="space-y-3 rounded-lg border p-4">
      <p className="text-sm font-semibold">{t("action.escalate")}</p>
      <Err state={state} />
      <div className="grid gap-3 sm:grid-cols-3">
        <L label={t("form.fieldToLevel")}>
          <select name="toLevel" className={selectCls} defaultValue="AEE">
            {["AEE", "EE", "SE", "CE", "Commissioner", "Lokayukta / Legal"].map((x) => <option key={x} value={x}>{translateEnum("workflow", x, locale)}</option>)}
          </select>
        </L>
        <L label={t("form.fieldToOfficer")}><Input name="toOfficer" /></L>
      </div>
      <L label={t("form.fieldReason")}><Textarea name="reason" rows={2} /></L>
      <Button type="submit" size="sm" disabled={pending}>{pending ? t("form.saving") : t("form.recordEscalationButton")}</Button>
    </form>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
