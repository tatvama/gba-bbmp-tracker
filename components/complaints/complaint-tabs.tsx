"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailRow } from "@/components/detail-row";
import { EmptyState } from "@/components/empty-state";
import { DocumentUpload } from "@/components/complaints/document-upload";
import { DocumentList } from "@/components/complaints/document-list";
import { CaseThread } from "@/components/complaints/case-thread";
import { JobEvidenceList } from "@/components/complaints/job-evidence-list";
import type { JobEvidenceDoc } from "@/lib/queries";
import { ReplyForm, ActionForm, CommunicationForm, EscalationForm } from "@/components/complaints/complaint-forms";
import { ComplaintAiDrafts } from "@/components/complaints/complaint-ai-drafts";
import { completeComplaintReminder } from "@/lib/actions/complaints";
import { formatDate, formatDateTime, orDash } from "@/lib/format";
import type {
  ComplaintWithRelations, ComplaintDocument, ComplaintTimelineEntry,
  ComplaintReply, ComplaintActionTaken, CommunicationLog, Reminder, AiDraft, AuditLog,
} from "@/lib/types";

type Officer = { id: string; full_name: string; designation: string };

export function ComplaintTabs({
  complaint, documents, jobDocuments, timeline, replies, actions, communications, reminders, escalations, aiDrafts, audit, officers, flags,
}: {
  complaint: ComplaintWithRelations;
  documents: ComplaintDocument[];
  jobDocuments: JobEvidenceDoc[];
  timeline: ComplaintTimelineEntry[];
  replies: ComplaintReply[];
  actions: ComplaintActionTaken[];
  communications: CommunicationLog[];
  reminders: Reminder[];
  escalations: Record<string, unknown>[];
  aiDrafts: AiDraft[];
  audit: AuditLog[];
  officers: Officer[];
  flags: { canEdit: boolean; canVerify: boolean; canField: boolean; aiConfigured: boolean };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") ?? "overview"; // deep-linkable (e.g. ?tab=documents)
  const docOpts = documents.map((d) => ({ id: d.id, title: d.title }));
  const c = complaint;

  async function completeReminder(id: string) {
    await completeComplaintReminder(id, c.id);
    router.refresh();
  }

  return (
    <Tabs defaultValue={initialTab}>
      <div className="overflow-x-auto">
        <TabsList className="mb-4 inline-flex w-max">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="correspondence">Correspondence</TabsTrigger>
          <TabsTrigger value="documents">Documents &amp; OCR ({documents.length + jobDocuments.length})</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="replies">Replies ({replies.length})</TabsTrigger>
          <TabsTrigger value="actions">Action Taken ({actions.length})</TabsTrigger>
          <TabsTrigger value="comms">Communications ({communications.length})</TabsTrigger>
          <TabsTrigger value="followups">Follow-ups ({reminders.filter((r) => r.status === "Pending").length})</TabsTrigger>
          <TabsTrigger value="escalations">Escalations ({escalations.length})</TabsTrigger>
          <TabsTrigger value="ai">AI Drafts</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="overview">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card><CardContent className="pt-6">
            <DetailRow label="Internal case number"><span className="font-mono">{orDash(c.internal_case_number)}</span></DetailRow>
            <DetailRow label="External complaint no.">{orDash(c.complaint_number)}</DetailRow>
            <DetailRow label="Type">{c.type}{c.complaint_subtype ? ` / ${c.complaint_subtype}` : ""}</DetailRow>
            <DetailRow label="Priority / impact">{orDash(c.priority)}{c.public_impact ? ` · ${c.public_impact}` : ""}</DetailRow>
            <DetailRow label="Complaint given">{formatDate(c.date_submitted)}</DetailRow>
            <DetailRow label="Acknowledged">{formatDate(c.acknowledgment_date)}</DetailRow>
            <DetailRow label="Filed mode / to">{orDash(c.complaint_mode)}{c.complaint_filed_to ? ` → ${c.complaint_filed_to}` : ""}</DetailRow>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <DetailRow label="Ward">{c.ward ? `${c.ward.new_no} · ${c.ward.new_name}` : "—"}</DetailRow>
            <DetailRow label="Division / sub-division">{orDash(c.division?.name)}{c.eng_subdivision ? ` · ${c.eng_subdivision.name}` : ""}</DetailRow>
            <DetailRow label="Assigned engineer">{c.assigned_engineer ? `${c.assigned_engineer.full_name} — ${c.assigned_engineer.designation}` : "—"}</DetailRow>
            <DetailRow label="Responsible department">{orDash(c.responsible_department)}</DetailRow>
            <DetailRow label="Latest reply">{c.latest_reply_date ? `${formatDate(c.latest_reply_date)} — ${orDash(c.latest_reply_summary)}` : "No reply yet"}</DetailRow>
            <DetailRow label="Latest action taken">{c.latest_action_taken_date ? `${formatDate(c.latest_action_taken_date)} — ${orDash(c.latest_action_taken_summary)}` : "None recorded"}</DetailRow>
            <DetailRow label="Next follow-up">{formatDate(c.next_follow_up_date)}</DetailRow>
          </CardContent></Card>
        </div>
        {c.description && <Card className="mt-6"><CardContent className="pt-6"><DetailRow label="Description">{c.description}</DetailRow>{c.requested_action && <DetailRow label="Requested action">{c.requested_action}</DetailRow>}</CardContent></Card>}
      </TabsContent>

      <TabsContent value="correspondence">
        <CaseThread documents={documents} escalations={escalations} aiDrafts={aiDrafts} />
      </TabsContent>

      <TabsContent value="documents">
        <div className="space-y-6">
          {flags.canField && (
            <Card><CardContent className="pt-6"><DocumentUpload complaintId={c.id} aiConfigured={flags.aiConfigured} /></CardContent></Card>
          )}
          {jobDocuments.length > 0 && (
            <Card><CardContent className="pt-6"><JobEvidenceList docs={jobDocuments} /></CardContent></Card>
          )}
          <DocumentList documents={documents} complaintId={c.id} canVerify={flags.canVerify} />
        </div>
      </TabsContent>

      <TabsContent value="timeline">
        {timeline.length === 0 ? <EmptyState title="No timeline yet" /> : (
          <ol className="relative space-y-4 pl-6">
            <div className="absolute left-[7px] top-1.5 bottom-1.5 w-0.5 bg-slate-100 dark:bg-slate-800 timeline-connector" />
            {timeline.map((t, idx) => {
              const staggerClass = `stagger-${(idx % 4) + 1}`;
              return (
                <li key={t.id} className={cn("relative timeline-event", staggerClass)}>
                  <span className="absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full border border-background bg-primary timeline-node" />
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{t.event_type}</Badge>
                    <span className="font-medium">{t.title}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(t.event_date)}</span>
                  </div>
                  {t.summary && <p className="mt-0.5 text-sm text-muted-foreground">{t.summary}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </TabsContent>

      <TabsContent value="replies">
        <div className="space-y-4">
          {flags.canEdit && <ReplyForm complaintId={c.id} documents={docOpts} />}
          {replies.length === 0 ? <EmptyState title="No replies recorded" /> : replies.map((r) => (
            <Card key={r.id}><CardContent className="pt-6">
              <div className="flex items-center justify-between"><span className="font-medium">{orDash(r.replied_by_name)} {r.replied_by_designation ? `(${r.replied_by_designation})` : ""}</span><span className="text-xs text-muted-foreground">{formatDate(r.reply_date)}</span></div>
              <p className="mt-1 text-sm">{orDash(r.reply_summary)}</p>
              {r.issues_remaining && <p className="mt-1 text-xs text-amber-dark">Issues remaining: {r.issues_remaining}</p>}
              {r.is_satisfactory != null && <Badge className="mt-2" variant={r.is_satisfactory ? "success" : "warning"}>{r.is_satisfactory ? "Satisfactory" : "Not satisfactory"}</Badge>}
            </CardContent></Card>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="actions">
        <div className="space-y-4">
          {flags.canEdit && <ActionForm complaintId={c.id} documents={docOpts} />}
          {actions.length === 0 ? <EmptyState title="No action-taken records" /> : actions.map((a) => (
            <Card key={a.id}><CardContent className="pt-6">
              <div className="flex items-center justify-between"><span className="font-medium">{orDash(a.action_taken_by_name)} {a.action_taken_by_designation ? `(${a.action_taken_by_designation})` : ""}</span><span className="text-xs text-muted-foreground">{formatDate(a.action_taken_date)}</span></div>
              <p className="mt-1 text-sm">{orDash(a.action_summary)}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {a.work_completed && <Badge variant="success">Work completed</Badge>}
                {a.site_visited && <Badge variant="outline">Site visited</Badge>}
                {a.pending_work && <Badge variant="warning">Pending work</Badge>}
              </div>
            </CardContent></Card>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="comms">
        <div className="space-y-4">
          {flags.canField && <CommunicationForm complaintId={c.id} officers={officers} />}
          {communications.length === 0 ? <EmptyState title="No communications logged" /> : communications.map((m) => (
            <Card key={m.id}><CardContent className="pt-6">
              <div className="flex items-center justify-between"><span className="font-medium">{m.comm_type}{m.contact_person ? ` · ${m.contact_person}` : ""}</span><span className="text-xs text-muted-foreground">{formatDateTime(m.occurred_at)}</span></div>
              {m.summary && <p className="mt-1 text-sm">{m.summary}</p>}
              {m.next_action && <p className="mt-1 text-xs text-muted-foreground">Next: {m.next_action}{m.next_action_date ? ` (${formatDate(m.next_action_date)})` : ""}</p>}
            </CardContent></Card>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="followups">
        {reminders.length === 0 ? <EmptyState title="No follow-ups" /> : (
          <ul className="space-y-2">
            {reminders.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.title}</p>
                  <p className="text-xs text-muted-foreground">{r.reminder_type ?? ""}{r.due_date ? ` · due ${formatDate(r.due_date)}` : ""}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={r.status === "Completed" ? "success" : "warning"}>{r.status}</Badge>
                  {r.status === "Pending" && (flags.canEdit || flags.canField) && (
                    <Button size="sm" variant="outline" onClick={() => completeReminder(r.id)}>Done</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="escalations">
        <div className="space-y-4">
          {flags.canEdit && <EscalationForm complaintId={c.id} />}
          {escalations.length === 0 ? <EmptyState title="No escalations" /> : escalations.map((e) => (
            <Card key={String(e.id)}><CardContent className="pt-6">
              <div className="flex items-center justify-between"><span className="font-medium">To {orDash(e.to_level as string)}{e.to_officer ? ` · ${e.to_officer}` : ""}</span><span className="text-xs text-muted-foreground">{formatDate(e.escalated_on as string)}</span></div>
              {e.reason ? <p className="mt-1 text-sm">{String(e.reason)}</p> : null}
            </CardContent></Card>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="ai">
        <ComplaintAiDrafts complaintId={c.id} aiConfigured={flags.aiConfigured} saved={aiDrafts} />
      </TabsContent>

      <TabsContent value="audit">
        {audit.length === 0 ? <EmptyState title="No recorded changes" /> : (
          <ul className="space-y-2 text-sm">
            {audit.map((a) => (
              <li key={a.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between"><span className="font-medium">{a.field_name ?? "change"}</span><span className="text-xs text-muted-foreground">{formatDateTime(a.changed_at)}</span></div>
                <p className="text-xs text-muted-foreground">{orDash(a.old_value)} → {orDash(a.new_value)}</p>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>
    </Tabs>
  );
}
