"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { COMPLAINT_STATUSES, REPLY_DOCUMENT_TYPES, ACTION_DOCUMENT_TYPES } from "@/lib/constants";
import { applyDocumentExtraction, type ActionState } from "@/lib/actions/complaints";
import type { ComplaintDocument } from "@/lib/types";

const selectCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function DocumentReview({ doc, onDone }: { doc: ComplaintDocument; onDone?: () => void }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(applyDocumentExtraction, {} as ActionState);
  const ex = doc.ai_extracted_json ?? {};
  const isReply = REPLY_DOCUMENT_TYPES.includes(doc.document_type ?? "");
  const isAction = ACTION_DOCUMENT_TYPES.includes(doc.document_type ?? "");

  React.useEffect(() => {
    if (state.success) {
      router.refresh();
      onDone?.();
    }
  }, [state, router, onDone]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Left: source OCR + AI summary */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="muted">{doc.document_type ?? "document"}</Badge>
          <Badge variant="outline">OCR: {doc.ocr_status}</Badge>
          {doc.ai_confidence && <Badge variant={doc.ai_confidence === "High" ? "success" : doc.ai_confidence === "Low" ? "destructive" : "warning"}>AI {doc.ai_confidence}</Badge>}
          {ex.needsManualReview && <Badge variant="warning">Needs manual review</Badge>}
        </div>
        {doc.ai_summary && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">AI summary</p>
            {doc.ai_summary}
          </div>
        )}
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase text-muted-foreground">OCR text</p>
          <Textarea readOnly value={doc.ocr_clean_text || doc.ocr_raw_text || "(no OCR text)"} rows={14} className="font-mono text-xs" />
        </div>
      </div>

      {/* Right: editable extracted fields */}
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="documentId" value={doc.id} />
        {state.error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">{state.error}</div>}
        <div className="rounded-md border border-amber/50 bg-amber/5 px-3 py-1.5 text-xs font-medium text-amber-dark">
          ⚠ Review before applying — nothing is changed until you approve. Edit any field.
        </div>

        <div className="grid grid-cols-2 gap-3">
          <F label="External complaint no.">
            <Input name="externalComplaintNumber" defaultValue={ex.complaintNumber ?? ""} />
          </F>
          <F label="Complaint given date">
            <Input type="date" name="complaintGivenDate" defaultValue="" />
          </F>
          <F label="Reply date">
            <Input type="date" name="replyDate" defaultValue={isDate(ex.replyDate) ? ex.replyDate : ""} />
          </F>
          <F label="Action taken date">
            <Input type="date" name="actionTakenDate" defaultValue={isDate(ex.actionTakenDate) ? ex.actionTakenDate : ""} />
          </F>
        </div>
        <F label="Reply summary">
          <Textarea name="replySummary" rows={2} defaultValue={ex.replyGiven || (isReply ? ex.summary : "") || ""} />
        </F>
        <F label="Action taken summary">
          <Textarea name="actionTakenSummary" rows={2} defaultValue={ex.actionTaken || (isAction ? ex.summary : "") || ""} />
        </F>
        <div className="grid grid-cols-2 gap-3">
          <F label="Suggested status">
            <select name="suggestedStatus" defaultValue={COMPLAINT_STATUSES.includes(ex.suggestedComplaintStatus as never) ? ex.suggestedComplaintStatus : ""} className={selectCls}>
              <option value="">— keep current —</option>
              {COMPLAINT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </F>
          <F label="Next follow-up date">
            <Input type="date" name="nextFollowUpDate" defaultValue={isDate(ex.suggestedFollowUpDate) ? ex.suggestedFollowUpDate : ""} />
          </F>
        </div>
        <F label="Pending issues">
          <Textarea name="pendingIssues" rows={2} defaultValue={(ex.pendingIssues ?? []).join("; ")} />
        </F>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="createReply" defaultChecked={isReply} /> Create a reply record
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="createAction" defaultChecked={isAction} /> Create an action-taken record
          </label>
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={pending}>{pending ? "Applying…" : "Approve & update complaint"}</Button>
          {onDone && <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>}
        </div>
      </form>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
