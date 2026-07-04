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
import { HistoryTimeline } from "@/components/complaints/history-timeline";
import { buildComplaintHistory } from "@/lib/complaint-history";
import { completeComplaintReminder } from "@/lib/actions/complaints";
import { formatDate, formatDateTime, orDash } from "@/lib/format";
import { Folder, MapPin, Activity, Clock, FileText } from "lucide-react";
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
  const historyEvents = React.useMemo(() => buildComplaintHistory(timeline, documents), [timeline, documents]);

  async function completeReminder(id: string) {
    await completeComplaintReminder(id, c.id);
    router.refresh();
  }

  return (
    <Tabs defaultValue={initialTab} className="space-y-6">
      {/* Sticky Tab Navigation Bar */}
      <div className="sticky top-[62px] z-25 bg-background/95 backdrop-blur py-3 border-b border-slate-150/85 -mx-4 md:-mx-6 px-4 md:px-6 no-print">
        <div className="overflow-x-auto scrollbar-none">
          <TabsList className="inline-flex w-max bg-slate-100/60 dark:bg-slate-900/60 p-1 rounded-xl gap-1 border border-slate-200/50 dark:border-slate-800">
            <TabsTrigger value="overview" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-primary data-[state=active]:shadow-2xs font-extrabold text-[12.5px] px-4 py-2 rounded-lg transition-all">Overview</TabsTrigger>
            <TabsTrigger value="correspondence" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-primary data-[state=active]:shadow-2xs font-extrabold text-[12.5px] px-4 py-2 rounded-lg transition-all">Correspondence</TabsTrigger>
            <TabsTrigger value="documents" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-primary data-[state=active]:shadow-2xs font-extrabold text-[12.5px] px-4 py-2 rounded-lg transition-all">Documents &amp; OCR ({documents.length + jobDocuments.length})</TabsTrigger>
            <TabsTrigger value="timeline" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-primary data-[state=active]:shadow-2xs font-extrabold text-[12.5px] px-4 py-2 rounded-lg transition-all">Timeline</TabsTrigger>
            <TabsTrigger value="replies" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-primary data-[state=active]:shadow-2xs font-extrabold text-[12.5px] px-4 py-2 rounded-lg transition-all">Replies ({replies.length})</TabsTrigger>
            <TabsTrigger value="actions" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-primary data-[state=active]:shadow-2xs font-extrabold text-[12.5px] px-4 py-2 rounded-lg transition-all">Action Taken ({actions.length})</TabsTrigger>
            <TabsTrigger value="comms" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-primary data-[state=active]:shadow-2xs font-extrabold text-[12.5px] px-4 py-2 rounded-lg transition-all">Communications ({communications.length})</TabsTrigger>
            <TabsTrigger value="followups" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-primary data-[state=active]:shadow-2xs font-extrabold text-[12.5px] px-4 py-2 rounded-lg transition-all">Follow-ups ({reminders.filter((r) => r.status === "Pending").length})</TabsTrigger>
            <TabsTrigger value="escalations" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-primary data-[state=active]:shadow-2xs font-extrabold text-[12.5px] px-4 py-2 rounded-lg transition-all">Escalations ({escalations.length})</TabsTrigger>
            <TabsTrigger value="ai" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-primary data-[state=active]:shadow-2xs font-extrabold text-[12.5px] px-4 py-2 rounded-lg transition-all">AI Drafts</TabsTrigger>
            <TabsTrigger value="audit" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-primary data-[state=active]:shadow-2xs font-extrabold text-[12.5px] px-4 py-2 rounded-lg transition-all">Audit</TabsTrigger>
          </TabsList>
        </div>
      </div>

      <TabsContent value="overview" className="space-y-6 animate-in fade-in duration-200">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Card 1: Case Information */}
          <Card className="border border-slate-150 dark:border-slate-850 bg-card rounded-xl shadow-2xs overflow-hidden flex flex-col">
            <CardContent className="p-6 flex-1 flex flex-col space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-850 pb-3">
                <Folder className="h-5 w-5 text-primary shrink-0" />
                <h3 className="text-[15px] font-black text-slate-900 dark:text-slate-150 uppercase tracking-wider">Case Information</h3>
              </div>
              <div className="grid grid-cols-2 gap-4 flex-1">
                <div className="space-y-1">
                  <span className="block text-[11px] font-black uppercase tracking-wider text-slate-400">Internal Case Number</span>
                  <span className="font-mono text-sm font-extrabold text-slate-800 dark:text-slate-205">{orDash(c.internal_case_number)}</span>
                </div>
                <div className="space-y-1">
                  <span className="block text-[11px] font-black uppercase tracking-wider text-slate-400">External Complaint No</span>
                  <span className="text-sm font-extrabold text-slate-800 dark:text-slate-205">{orDash(c.complaint_number)}</span>
                </div>
                <div className="space-y-1">
                  <span className="block text-[11px] font-black uppercase tracking-wider text-slate-400">Type</span>
                  <span className="text-sm font-extrabold text-slate-800 dark:text-slate-205">{c.type}{c.complaint_subtype ? ` / ${c.complaint_subtype}` : ""}</span>
                </div>
                <div className="space-y-1">
                  <span className="block text-[11px] font-black uppercase tracking-wider text-slate-400">Filed Mode &amp; Recipient</span>
                  <span className="text-sm font-extrabold text-slate-800 dark:text-slate-205">{orDash(c.complaint_mode)}{c.complaint_filed_to ? ` → ${c.complaint_filed_to}` : ""}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Location & Assignment */}
          <Card className="border border-slate-150 dark:border-slate-850 bg-card rounded-xl shadow-2xs overflow-hidden flex flex-col">
            <CardContent className="p-6 flex-1 flex flex-col space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-850 pb-3">
                <MapPin className="h-5 w-5 text-primary shrink-0" />
                <h3 className="text-[15px] font-black text-slate-900 dark:text-slate-150 uppercase tracking-wider">Location &amp; Assignment</h3>
              </div>
              <div className="grid grid-cols-2 gap-4 flex-1">
                <div className="space-y-1">
                  <span className="block text-[11px] font-black uppercase tracking-wider text-slate-400">Ward Details</span>
                  <span className="text-sm font-extrabold text-slate-800 dark:text-slate-205">{c.ward ? `${c.ward.new_no} · ${c.ward.new_name}` : "—"}</span>
                </div>
                <div className="space-y-1">
                  <span className="block text-[11px] font-black uppercase tracking-wider text-slate-400">Division / Sub-Division</span>
                  <span className="text-sm font-extrabold text-slate-800 dark:text-slate-205">{orDash(c.division?.name)}{c.eng_subdivision ? ` · ${c.eng_subdivision.name}` : ""}</span>
                </div>
                <div className="space-y-1 col-span-2">
                  <span className="block text-[11px] font-black uppercase tracking-wider text-slate-400">Assigned Engineer</span>
                  <span className="text-sm font-extrabold text-slate-800 dark:text-slate-205">{c.assigned_engineer ? `${c.assigned_engineer.full_name} (${c.assigned_engineer.designation})` : "—"}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Status & Metadata */}
          <Card className="border border-slate-150 dark:border-slate-850 bg-card rounded-xl shadow-2xs overflow-hidden flex flex-col">
            <CardContent className="p-6 flex-1 flex flex-col space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-850 pb-3">
                <Clock className="h-5 w-5 text-primary shrink-0" />
                <h3 className="text-[15px] font-black text-slate-900 dark:text-slate-150 uppercase tracking-wider">Status &amp; Timeline</h3>
              </div>
              <div className="grid grid-cols-2 gap-4 flex-1">
                <div className="space-y-1">
                  <span className="block text-[11px] font-black uppercase tracking-wider text-slate-400">Priority / Impact</span>
                  <span className="text-sm font-extrabold text-slate-800 dark:text-slate-205">{orDash(c.priority)}{c.public_impact ? ` · ${c.public_impact}` : ""}</span>
                </div>
                <div className="space-y-1">
                  <span className="block text-[11px] font-black uppercase tracking-wider text-slate-400">Complaint Given Date</span>
                  <span className="text-sm font-extrabold text-slate-800 dark:text-slate-205">{formatDate(c.date_submitted)}</span>
                </div>
                <div className="space-y-1">
                  <span className="block text-[11px] font-black uppercase tracking-wider text-slate-400">Acknowledged Date</span>
                  <span className="text-sm font-extrabold text-slate-800 dark:text-slate-205">{formatDate(c.acknowledgment_date)}</span>
                </div>
                <div className="space-y-1">
                  <span className="block text-[11px] font-black uppercase tracking-wider text-slate-400">Next Follow-up</span>
                  <span className="text-sm font-extrabold text-slate-800 dark:text-slate-205">{formatDate(c.next_follow_up_date)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 4: Action & Reply Snapshot */}
          <Card className="border border-slate-150 dark:border-slate-850 bg-card rounded-xl shadow-2xs overflow-hidden flex flex-col">
            <CardContent className="p-6 flex-1 flex flex-col space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-850 pb-3">
                <Activity className="h-5 w-5 text-primary shrink-0" />
                <h3 className="text-[15px] font-black text-slate-900 dark:text-slate-150 uppercase tracking-wider">Action &amp; Reply Snapshot</h3>
              </div>
              <div className="grid grid-cols-1 gap-4 flex-1">
                <div className="space-y-1">
                  <span className="block text-[11px] font-black uppercase tracking-wider text-slate-400">Responsible Department</span>
                  <span className="text-sm font-extrabold text-slate-800 dark:text-slate-205">{orDash(c.responsible_department)}</span>
                </div>
                <div className="space-y-1">
                  <span className="block text-[11px] font-black uppercase tracking-wider text-slate-400">Latest Reply Summary</span>
                  <span className="text-sm font-extrabold text-slate-850 dark:text-slate-205">{c.latest_reply_date ? `${formatDate(c.latest_reply_date)} — ${orDash(c.latest_reply_summary)}` : "No reply yet"}</span>
                </div>
                <div className="space-y-1">
                  <span className="block text-[11px] font-black uppercase tracking-wider text-slate-400">Latest Action Taken Summary</span>
                  <span className="text-sm font-extrabold text-slate-850 dark:text-slate-250">{c.latest_action_taken_date ? `${formatDate(c.latest_action_taken_date)} — ${orDash(c.latest_action_taken_summary)}` : "None recorded"}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Rich Document Card for Description */}
        {c.description && (
          <Card className="border border-slate-150 dark:border-slate-850 bg-card rounded-xl shadow-2xs overflow-hidden">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-850 pb-3">
                <FileText className="h-5 w-5 text-primary shrink-0" />
                <h3 className="text-[15px] font-black text-slate-900 dark:text-slate-150 uppercase tracking-wider">Detailed Description &amp; Scope</h3>
              </div>
              <div className="max-w-3xl space-y-4">
                <div className="space-y-1">
                  <span className="block text-[11px] font-black uppercase tracking-wider text-slate-400">Complaint narrative</span>
                  <p className="text-sm text-slate-800 dark:text-slate-300 leading-relaxed font-semibold">
                    {c.description}
                  </p>
                </div>
                {c.requested_action && (
                  <div className="space-y-1 pt-2">
                    <span className="block text-[11px] font-black uppercase tracking-wider text-slate-400">Requested Action</span>
                    <p className="text-sm text-slate-800 dark:text-slate-350 leading-relaxed font-semibold italic">
                      {c.requested_action}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
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
        <HistoryTimeline events={historyEvents} />
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
