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
  return (
    <form ref={ref} action={action} className="space-y-3 rounded-lg border p-4">
      <p className="text-sm font-semibold">Record a reply</p>
      <Err state={state} />
      <div className="grid gap-3 sm:grid-cols-3">
        <L label="Reply date"><Input type="date" name="replyDate" /></L>
        <L label="Replied by"><Input name="repliedByName" /></L>
        <L label="Designation"><Input name="repliedByDesignation" /></L>
        <L label="Department"><Input name="department" /></L>
        <L label="Reply mode"><Input name="replyMode" placeholder="Letter / Email / Portal" /></L>
        <L label="Linked document">
          <select name="documentId" className={selectCls}><option value="">—</option>{documents.map((d) => <option key={d.id} value={d.id}>{d.title ?? d.id.slice(0, 8)}</option>)}</select>
        </L>
      </div>
      <L label="Reply summary"><Textarea name="replySummary" rows={2} /></L>
      <L label="Issues remaining"><Textarea name="issuesRemaining" rows={2} /></L>
      <label className="flex items-center gap-2 text-sm"><Checkbox name="isSatisfactory" /> Reply is satisfactory</label>
      <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Add reply"}</Button>
    </form>
  );
}

export function ActionForm({ complaintId, documents }: { complaintId: string; documents: DocOpt[] }) {
  const [state, action, pending] = useActionState(addComplaintActionTaken.bind(null, complaintId), {} as ActionState);
  const ref = useFormReset(state);
  return (
    <form ref={ref} action={action} className="space-y-3 rounded-lg border p-4">
      <p className="text-sm font-semibold">Record action taken</p>
      <Err state={state} />
      <div className="grid gap-3 sm:grid-cols-3">
        <L label="Action taken date"><Input type="date" name="actionTakenDate" /></L>
        <L label="Action by"><Input name="actionTakenByName" /></L>
        <L label="Designation"><Input name="actionTakenByDesignation" /></L>
        <L label="Department"><Input name="department" /></L>
        <L label="Linked document">
          <select name="documentId" className={selectCls}><option value="">—</option>{documents.map((d) => <option key={d.id} value={d.id}>{d.title ?? d.id.slice(0, 8)}</option>)}</select>
        </L>
      </div>
      <L label="Action summary"><Textarea name="actionSummary" rows={2} /></L>
      <L label="Pending work"><Textarea name="pendingWork" rows={2} /></L>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><Checkbox name="workCompleted" /> Work completed</label>
        <label className="flex items-center gap-2"><Checkbox name="siteVisited" /> Site visited</label>
        <label className="flex items-center gap-2"><Checkbox name="photoEvidenceAvailable" /> Photo evidence</label>
      </div>
      <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Add action taken"}</Button>
    </form>
  );
}

export function CommunicationForm({ complaintId, officers }: { complaintId: string; officers: OfficerOpt[] }) {
  const [state, action, pending] = useActionState(addComplaintCommunication.bind(null, complaintId), {} as ActionState);
  const ref = useFormReset(state);
  return (
    <form ref={ref} action={action} className="space-y-3 rounded-lg border p-4">
      <p className="text-sm font-semibold">Log a communication</p>
      <Err state={state} />
      <div className="grid gap-3 sm:grid-cols-3">
        <L label="Type">
          <select name="communicationType" className={selectCls} defaultValue="Phone Call">{COMMUNICATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        </L>
        <L label="Date"><Input type="date" name="communicationDate" /></L>
        <L label="Officer">
          <select name="officerId" className={selectCls}><option value="">—</option>{officers.map((o) => <option key={o.id} value={o.id}>{o.full_name} — {o.designation}</option>)}</select>
        </L>
        <L label="Contact person"><Input name="contactPerson" /></L>
        <L label="Phone / email"><Input name="phoneOrEmail" /></L>
        <L label="Next action date"><Input type="date" name="nextActionDate" /></L>
      </div>
      <L label="Summary"><Textarea name="summary" rows={2} /></L>
      <L label="Outcome / next action"><Input name="nextAction" /></L>
      <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Add communication"}</Button>
    </form>
  );
}

export function EscalationForm({ complaintId }: { complaintId: string }) {
  const [state, action, pending] = useActionState(addComplaintEscalation.bind(null, complaintId), {} as ActionState);
  const ref = useFormReset(state);
  return (
    <form ref={ref} action={action} className="space-y-3 rounded-lg border p-4">
      <p className="text-sm font-semibold">Escalate</p>
      <Err state={state} />
      <div className="grid gap-3 sm:grid-cols-3">
        <L label="To level">
          <select name="toLevel" className={selectCls} defaultValue="AEE">
            {["AEE", "EE", "SE", "CE", "Commissioner", "Lokayukta / Legal"].map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </L>
        <L label="To officer"><Input name="toOfficer" /></L>
      </div>
      <L label="Reason"><Textarea name="reason" rows={2} /></L>
      <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Record escalation"}</Button>
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
