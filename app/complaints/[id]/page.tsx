import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, ShieldAlert, FolderArchive, Gavel, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PrintButton } from "@/components/print-button";
import { ComplaintTabs } from "@/components/complaints/complaint-tabs";
import { CaseWorkflow } from "@/components/complaints/case-workflow";
import { AIInsightsPanel } from "@/components/ai/AIInsightsPanel";
import { getComplaintAiRecommendationAction } from "@/lib/actions/ai-advisor";
import {
  getComplaint, listComplaintDocuments, listComplaintTimeline, listComplaintReplies,
  listComplaintActions, listComplaintCommunications, listComplaintReminders,
  listComplaintEscalations, listComplaintAiDrafts, listAuditLogs, getComplaintFormOptions,
  getComplaintLetterDraft, getJobDocumentsByNumber,
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

  const [documents, timeline, replies, actions, communications, reminders, escalations, aiDrafts, audit, options, letterDraft, user, aiRecommendation] =
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
      getComplaintLetterDraft(id),
      getSessionUser(),
      getComplaintAiRecommendationAction(id),
    ]);

  // The job case's imported evidence (source PDFs/JSON) lives in job_documents,
  // keyed by job number — surfaced on the complaint so every imported file is viewable here.
  const jobDocuments = complaint.job_number ? await getJobDocumentsByNumber(complaint.job_number) : [];

  // The complaint letter the forensic ZIP already drafted (shown in the Submit
  // step for view/download/read — never regenerated).
  const letter = {
    text: letterDraft?.content ?? null,
    fileName: letterDraft?.file_name ?? null,
    pdfDocId: documents.find((d) => d.document_type === "Generated complaint letter (PDF)")?.id ?? null,
    docxDocId: documents.find((d) => d.document_type === "Generated complaint letter")?.id ?? null,
  };

  const flags = {
    canEdit: hasRole(user, COMPLAINT_WRITE_ROLES),
    canVerify: hasRole(user, COMPLAINT_VERIFY_ROLES),
    canField: hasRole(user, COMPLAINT_FIELD_ROLES),
    aiConfigured: isAiConfigured(),
  };

  return (
    <div className="mx-auto max-w-7xl grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">
      <div className="min-w-0 max-w-5xl xl:max-w-none">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="no-print -ml-2">
          <Link href="/complaints"><ArrowLeft className="h-4 w-4" /> Complaints</Link>
        </Button>
        <div className="no-print flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline"><Link href={`/complaints/${id}/print`}>Case file</Link></Button>
          {flags.canVerify && (
            <>
              <Button asChild size="sm" variant="outline"><Link href={`/complaints/${id}/forensics`}><ShieldAlert className="h-4 w-4" /> Forensic audit</Link></Button>
              {complaint.job_number && (
                <>
                  <Button asChild size="sm" variant="outline"><Link href={`/complaints/job/${encodeURIComponent(complaint.job_number)}/audit`}><Gavel className="h-4 w-4" /> Job-number audit</Link></Button>
                  <Button asChild size="sm" variant="outline"><Link href={`/complaints/job/${encodeURIComponent(complaint.job_number)}/letter`}><ScrollText className="h-4 w-4" /> Draft letter</Link></Button>
                </>
              )}
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
          {(() => {
            const today = new Date().toISOString().slice(0, 10);
            const dd = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
            const badges: React.ReactNode[] = [];
            if (complaint.date_submitted) {
              const ago = dd(today, complaint.date_submitted);
              badges.push(<Badge key="filed" variant="outline">Filed {ago <= 0 ? "today" : `${ago}d ago`}</Badge>);
            }
            if (complaint.next_follow_up_date) {
              const left = dd(complaint.next_follow_up_date, today);
              badges.push(
                left < 0
                  ? <Badge key="fu" variant="destructive">Overdue {Math.abs(left)}d · follow-up was {formatDate(complaint.next_follow_up_date)}</Badge>
                  : <Badge key="fu" variant="warning">Follow-up {left === 0 ? "today" : `in ${left}d`} ({formatDate(complaint.next_follow_up_date)})</Badge>,
              );
            }
            return badges;
          })()}
        </div>
      </div>

      {flags.canField && (
        <CaseWorkflow
          complaintId={complaint.id}
          status={complaint.status}
          jobNumber={complaint.job_number ?? null}
          caseNumber={complaint.internal_case_number ?? null}
          aiConfigured={flags.aiConfigured}
          letter={letter}
        />
      )}

      <ComplaintTabs
        complaint={complaint}
        documents={documents}
        jobDocuments={jobDocuments}
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
      <aside className="xl:sticky xl:top-4 order-first xl:order-none">
        <AIInsightsPanel complaintId={id} initialRecommendation={aiRecommendation} aiConfigured={flags.aiConfigured} />
      </aside>
    </div>
  );
}
