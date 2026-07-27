import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, ShieldAlert, FolderArchive, Gavel, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PrintButton } from "@/components/print-button";
import { ComplaintTabs } from "@/components/complaints/complaint-tabs";
import { CaseWorkflow } from "@/components/complaints/case-workflow";
import { LetterEmailPanel } from "@/components/complaints/letter-email-panel";
import { AIInsightsPanel } from "@/components/ai/AIInsightsPanel";
import { getComplaintAiRecommendationAction } from "@/lib/actions/ai-advisor";
import { getMailStatusAction, type MailStatus } from "@/lib/actions/mail";
import { listLetterEmails } from "@/lib/mail/queries";
import { cn } from "@/lib/utils";
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
import { getTranslations } from "@/lib/i18n/server";
import { translateEnum } from "@/lib/i18n/translate-enum";

export const dynamic = "force-dynamic";

const getBadgeStyles = (status: string) => {
  const s = status.toLowerCase();
  if (s === "filed") return "bg-blue-50/80 text-blue-700 border-blue-200/60 dark:bg-blue-950/30 dark:border-blue-900/40 dark:text-blue-400";
  if (s === "draft") return "bg-slate-50/80 text-slate-600 border-slate-200/60 dark:bg-slate-900/40 dark:border-slate-800 dark:text-slate-400";
  if (s === "pending" || s.includes("awaiting")) return "bg-amber-50/80 text-amber-700 border-amber-200/60 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-400";
  if (s === "escalated") return "bg-purple-50/80 text-purple-700 border-purple-200/60 dark:bg-purple-950/30 dark:border-purple-900/40 dark:text-purple-400";
  if (s === "closed" || s === "resolved") return "bg-emerald-50/80 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/30 dark:border-emerald-900/40 dark:text-emerald-400";
  if (s === "overdue") return "bg-rose-50/80 text-rose-700 border-rose-200/60 dark:bg-rose-950/30 dark:border-rose-900/40 dark:text-rose-400";
  return "bg-slate-50 text-slate-700 border-slate-200";
};

export default async function ComplaintDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** `from=jobs` when arriving via the Job-Number Forensic Audits page's
   *  "Case details" link — points the breadcrumb back there instead of the
   *  generic complaints list. */
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const fromJobs = from === "jobs";

  const { t, locale } = await getTranslations("complaints");
  const { t: tc } = await getTranslations("common");

  const [complaint, documents, timeline, replies, actions, communications, reminders, escalations, aiDrafts, audit, options, letterDraft, user, aiRecommendation] =
    await Promise.all([
      getComplaint(id),
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
  if (!complaint) notFound();

  const jobDocuments = complaint.job_number ? await getJobDocumentsByNumber(complaint.job_number) : [];

  const letter = {
    letterId: letterDraft?.id ?? null,
    text: letterDraft?.content ?? null,
    fileName: letterDraft?.file_name ?? null,
    pdfDocId: documents.find((d) => d.document_type === "Generated complaint letter (PDF)")?.id ?? null,
    docxDocId: documents.find((d) => d.document_type === "Generated complaint letter")?.id ?? null,
    printStatus: letterDraft?.print_status ?? "none",
    printedAt: letterDraft?.printed_at ?? null,
    printedByName: letterDraft?.printed_by_name ?? null,
  };

  const flags = {
    canEdit: hasRole(user, COMPLAINT_WRITE_ROLES),
    canVerify: hasRole(user, COMPLAINT_VERIFY_ROLES),
    canField: hasRole(user, COMPLAINT_FIELD_ROLES),
    aiConfigured: isAiConfigured(),
  };

  // letter_emails is deny-by-default under RLS and readable only via the admin
  // client, so it is fetched here rather than from the client component. Gated on
  // the same role set as sendLetterEmailAction.
  const mailStatusRaw = flags.canField ? await getMailStatusAction() : null;
  const mailStatus: MailStatus | null = mailStatusRaw && !("error" in mailStatusRaw) ? mailStatusRaw : null;
  const letterEmails = flags.canField ? await listLetterEmails(id) : [];

  return (
    <div className="mx-auto max-w-5xl px-4 md:px-6 space-y-6">
      {/* Sticky Action Toolbar & Breadcrumbs */}
      <div className="no-print sticky top-0 z-30 flex flex-wrap items-center justify-between gap-4 border-b border-slate-150 bg-background/95 py-3.5 backdrop-blur dark:border-slate-850">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 select-none">
          {fromJobs ? (
            <Link href="/complaints/jobs" className="hover:text-primary transition-colors">Job-Number Forensic Audits</Link>
          ) : (
            <Link href="/complaints" className="hover:text-primary transition-colors">{t("detailPage.breadcrumbComplaints")}</Link>
          )}
          <span className="text-slate-350">/</span>
          <span className="text-slate-800 dark:text-slate-200 font-bold">{t("detailPage.breadcrumbCaseDetails")}</span>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Button asChild variant="outline" className="h-10 text-xs font-semibold border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer rounded-lg px-5"><Link href={`/complaints/${id}/print`}>{t("detailPage.action.caseFile")}</Link></Button>
          {flags.canVerify && (
            <>
              <Button asChild variant="outline" className="h-10 text-xs font-semibold border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer rounded-lg px-5"><Link href={`/complaints/${id}/forensics`}><ShieldAlert className="h-4 w-4 mr-1 text-rose-500" /> {t("detailPage.action.forensicAudit")}</Link></Button>
              {complaint.job_number && (
                <>
                  <Button asChild variant="outline" className="h-10 text-xs font-semibold border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer rounded-lg px-5"><Link href={`/complaints/job/${encodeURIComponent(complaint.job_number)}/audit`}><Gavel className="h-4 w-4 mr-1 text-slate-550" /> {t("detailPage.action.jobNumberAudit")}</Link></Button>
                  <Button asChild variant="outline" className="h-10 text-xs font-semibold border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer rounded-lg px-5"><Link href={`/complaints/job/${encodeURIComponent(complaint.job_number)}/letter`}><ScrollText className="h-4 w-4 mr-1 text-slate-550" /> {t("detailPage.action.draftLetter")}</Link></Button>
                </>
              )}
              <Button asChild variant="outline" className="h-10 text-xs font-semibold border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer rounded-lg px-5"><Link href={`/complaints/${id}/dossier`}><FolderArchive className="h-4 w-4 mr-1 text-slate-550" /> {t("detailPage.action.dossier")}</Link></Button>
            </>
          )}
          <PrintButton className="h-10 text-xs font-semibold border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer rounded-lg px-5" />
          {flags.canEdit && (
            <Button asChild className="h-10 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/95 shadow-xs hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer rounded-lg px-5"><Link href={`/complaints/${id}/edit`}><Pencil className="h-4 w-4 mr-1.5" /> {tc("action.edit")}</Link></Button>
          )}
        </div>
      </div>

      {/* Complaint Main Title Section */}
      <div className="space-y-2 select-none">
        <p className="font-mono text-xs font-bold text-slate-455 dark:text-slate-500 tracking-wider">
          {complaint.internal_case_number ?? "—"}
          {complaint.job_number && (
            <span className="text-indigo-600 dark:text-indigo-400"> · {t("detailPage.jobPrefix", { jobNumber: complaint.job_number })}</span>
          )}
        </p>
        <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight sm:text-[30px] leading-tight max-w-4xl">
          {complaint.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2 pt-1.5">
          <Badge className={cn("text-[11px] px-2.5 h-6 rounded-md font-bold border", getBadgeStyles(complaint.status))}>
            {translateEnum("status", complaint.status, locale)}
          </Badge>
          {complaint.priority && (
            <Badge className={cn(
              "text-[11px] px-2.5 h-6 rounded-md font-bold border",
              complaint.priority.toLowerCase() === "urgent" ? "border-rose-250 bg-rose-50/70 text-rose-800 dark:bg-rose-950/20 dark:border-rose-900 dark:text-rose-455" :
              complaint.priority.toLowerCase() === "high" ? "border-amber-250 bg-amber-50/70 text-amber-800 dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-455" :
              "border-slate-200 bg-slate-50 text-slate-700 dark:bg-slate-900/40"
            )}>
              {t("detailPage.priorityBadge", { priority: translateEnum("workflow", complaint.priority, locale) })}
            </Badge>
          )}
          {(() => {
            const today = new Date().toISOString().slice(0, 10);
            const dd = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
            const badges: React.ReactNode[] = [];
            if (complaint.date_submitted) {
              const ago = dd(today, complaint.date_submitted);
              badges.push(
                <Badge key="filed" className="text-[11px] px-2.5 h-6 rounded-md font-bold border border-slate-200 bg-slate-50/60 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-350">
                  {ago <= 0 ? t("detailPage.filedToday") : t("detailPage.filedDaysAgo", { days: ago })}
                </Badge>
              );
            }
            if (complaint.next_follow_up_date) {
              const left = dd(complaint.next_follow_up_date, today);
              badges.push(
                left < 0
                  ? <Badge key="fu" className="text-[11px] px-2.5 h-6 rounded-md font-bold border border-rose-250 bg-rose-50/70 text-rose-800 dark:bg-rose-950/20 dark:border-rose-900 dark:text-rose-455">{t("detailPage.overdueFollowUp", { days: Math.abs(left), date: formatDate(complaint.next_follow_up_date) })}</Badge>
                  : <Badge key="fu" className="text-[11px] px-2.5 h-6 rounded-md font-bold border border-amber-250 bg-amber-50/70 text-amber-800 dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-455">{left === 0 ? t("detailPage.followUpToday", { date: formatDate(complaint.next_follow_up_date) }) : t("detailPage.followUpInDays", { days: left, date: formatDate(complaint.next_follow_up_date) })}</Badge>,
              );
            }
            return badges;
          })()}
        </div>
      </div>

      {/* AI Advisory Row */}
      <div className="no-print">
        <AIInsightsPanel complaintId={id} initialRecommendation={aiRecommendation} aiConfigured={flags.aiConfigured} priority={complaint.priority ?? null} />
      </div>

      {flags.canField && (
        <CaseWorkflow
          complaintId={complaint.id}
          status={complaint.status}
          jobNumber={complaint.job_number ?? null}
          caseNumber={complaint.internal_case_number ?? null}
          aiConfigured={flags.aiConfigured}
          letter={letter}
          documents={documents}
          escalationStage={complaint.escalation_stage}
          escalationStageDeadline={complaint.escalation_stage_deadline}
          acknowledgmentDate={complaint.acknowledgment_date}
          submittedDate={complaint.date_submitted ?? null}
          submissionChannel={complaint.complaint_mode ?? null}
          corporationName={complaint.corporation?.name ?? null}
        />
      )}

      {flags.canField && (
        <LetterEmailPanel
          complaintId={complaint.id}
          // null, not letter.pdfDocId: this standalone panel lets the user pick
          // ANY letter kind from SELECTABLE_LETTER_KINDS (reminder, counter-reply,
          // escalation letter, legal notice …), not only the original complaint
          // letter. Passing a fixed documentId would attach that one document
          // regardless of the kind picked; null lets sendLetterEmail's own
          // KIND_TO_DOC_TYPE lookup (lib/mail/send.ts) find the document that
          // actually matches whichever kind is selected.
          documentId={null}
          mailStatus={mailStatus}
          initialHistory={letterEmails}
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
  );
}
