import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, ShieldAlert, FolderArchive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PrintButton } from "@/components/print-button";
import { ComplaintTabs } from "@/components/complaints/complaint-tabs";
import {
  getComplaint, listComplaintDocuments, listComplaintTimeline, listComplaintReplies,
  listComplaintActions, listComplaintCommunications, listComplaintReminders,
  listComplaintEscalations, listComplaintAiDrafts, listAuditLogs, getComplaintFormOptions,
} from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/provider";
import { COMPLAINT_WRITE_ROLES, COMPLAINT_VERIFY_ROLES, COMPLAINT_FIELD_ROLES } from "@/lib/constants";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ComplaintDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const complaint = await getComplaint(id);
  if (!complaint) notFound();

  const [documents, timeline, replies, actions, communications, reminders, escalations, aiDrafts, audit, options, user] =
    await Promise.all([
      listComplaintDocuments(id),
      listComplaintTimeline(id),
      listComplaintReplies(id),
      listComplaintActions(id),
      listComplaintCommunications(id),
      listComplaintReminders(id),
      listComplaintEscalations(id),
      listComplaintAiDrafts(id),
      listAuditLogs({ entityType: "complaint", entityId: id }, 100),
      getComplaintFormOptions(),
      getSessionUser(),
    ]);

  const flags = {
    canEdit: hasRole(user, COMPLAINT_WRITE_ROLES),
    canVerify: hasRole(user, COMPLAINT_VERIFY_ROLES),
    canField: hasRole(user, COMPLAINT_FIELD_ROLES),
    aiConfigured: isAiConfigured(),
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="no-print -ml-2">
          <Link href="/complaints"><ArrowLeft className="h-4 w-4" /> Complaints</Link>
        </Button>
        <div className="no-print flex gap-2">
          <Button asChild size="sm" variant="outline"><Link href={`/complaints/${id}/print`}>Case file</Link></Button>
          {flags.canVerify && (
            <>
              <Button asChild size="sm" variant="outline"><Link href={`/complaints/${id}/forensics`}><ShieldAlert className="h-4 w-4" /> Forensic audit</Link></Button>
              <Button asChild size="sm" variant="outline"><Link href={`/complaints/${id}/dossier`}><FolderArchive className="h-4 w-4" /> Dossier</Link></Button>
            </>
          )}
          <PrintButton />
          {flags.canEdit && (
            <Button asChild size="sm"><Link href={`/complaints/${id}/edit`}><Pencil className="h-4 w-4" /> Edit</Link></Button>
          )}
        </div>
      </div>

      <div className="mb-4">
        <p className="font-mono text-xs text-muted-foreground">{complaint.internal_case_number ?? "—"}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{complaint.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="muted">{complaint.status}</Badge>
          {complaint.priority && <Badge variant="outline">{complaint.priority} priority</Badge>}
          {complaint.next_follow_up_date && <Badge variant="warning">Next follow-up {formatDate(complaint.next_follow_up_date)}</Badge>}
        </div>
      </div>

      <ComplaintTabs
        complaint={complaint}
        documents={documents}
        timeline={timeline}
        replies={replies}
        actions={actions}
        communications={communications}
        reminders={reminders}
        escalations={escalations}
        aiDrafts={aiDrafts}
        audit={audit}
        officers={options.contacts}
        flags={flags}
      />
    </div>
  );
}
