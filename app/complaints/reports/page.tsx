import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportTable } from "@/components/reports/report-table";
import { listComplaints, listComplaintDocsForReports } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import type { ComplaintWithRelations } from "@/lib/types";
import { COMPLAINT_OPEN_STATUSES } from "@/lib/constants";
import { getTranslations } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Complaint reports" };

export default async function ComplaintReportsPage() {
  const { t } = await getTranslations("complaints");
  const COLS = [
    { key: "case", label: t("table.caseNumber") },
    { key: "title", label: t("table.title") },
    { key: "ward", label: t("table.ward") },
    { key: "engineer", label: t("table.engineer") },
    { key: "status", label: t("table.status") },
    { key: "given", label: t("list.reports.colGiven") },
    { key: "followup", label: t("list.reports.colFollowUp") },
  ];
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";
  const [complaints, docs] = await Promise.all([listComplaints(), listComplaintDocsForReports()]);
  const open = new Set<string>(COMPLAINT_OPEN_STATUSES);

  const row = (c: ComplaintWithRelations) => ({
    case: c.internal_case_number ?? "",
    title: c.title,
    ward: c.ward ? String(c.ward.new_no) : "",
    engineer: c.assigned_engineer?.full_name ?? "",
    status: c.status,
    given: c.date_submitted ? formatDate(c.date_submitted) : "",
    followup: c.next_follow_up_date ? formatDate(c.next_follow_up_date) : "",
  });

  const pending = complaints.filter((c) => open.has(c.status)).map(row);
  const overdue = complaints.filter((c) => open.has(c.status) && c.next_follow_up_date && c.next_follow_up_date < today).map(row);
  const filedMonth = complaints.filter((c) => c.date_submitted && c.date_submitted >= monthStart).map(row);
  const replyReceived = complaints.filter((c) => c.latest_reply_date).map(row);
  const noReply = complaints.filter((c) => !c.latest_reply_date && open.has(c.status)).map(row);
  const actionTaken = complaints.filter((c) => c.latest_action_taken_date).map(row);
  const noAction = complaints.filter((c) => !c.latest_action_taken_date && c.latest_reply_date).map(row);
  const missingNumber = complaints.filter((c) => !c.complaint_number).map(row);

  const docRow = (d: (typeof docs)[number]) => ({
    case: d.complaint?.internal_case_number ?? "",
    document: d.title ?? d.original_file_name ?? "",
    type: d.document_type ?? "",
    ocr: d.ocr_status,
    verification: d.verification_status,
    confidence: d.ai_confidence ?? "",
  });
  const DOC_COLS = [
    { key: "case", label: t("table.caseNumber") }, { key: "document", label: t("list.reports.colDocument") }, { key: "type", label: t("filter.type") },
    { key: "ocr", label: t("list.reports.colOcr") }, { key: "verification", label: t("list.reports.colVerification") }, { key: "confidence", label: t("list.reports.colAiConfidence") },
  ];
  const ocrReview = docs.filter((d) => ["Pending Review", "Low Confidence", "Needs Correction"].includes(d.verification_status) || d.ocr_status === "Needs Manual Review").map(docRow);
  const lowConf = docs.filter((d) => d.ai_confidence === "Low" || d.ocr_status === "Needs Manual Review").map(docRow);

  return (
    <div>
      <PageHeader title={t("list.reports.title")} description={t("list.reports.description")} />
      <div className="space-y-6">
        <Section title={t("list.reports.sectionPending", { count: pending.length })}><ReportTable columns={COLS} rows={pending} fileBase="complaints-pending" /></Section>
        <Section title={t("list.reports.sectionOverdueFollowUp", { count: overdue.length })}><ReportTable columns={COLS} rows={overdue} fileBase="complaints-overdue" /></Section>
        <Section title={t("list.reports.sectionFiledThisMonth", { count: filedMonth.length })}><ReportTable columns={COLS} rows={filedMonth} fileBase="complaints-filed-month" /></Section>
        <Section title={t("list.reports.sectionReplyReceived", { count: replyReceived.length })}><ReportTable columns={COLS} rows={replyReceived} fileBase="complaints-reply-received" /></Section>
        <Section title={t("list.reports.sectionNoReply", { count: noReply.length })}><ReportTable columns={COLS} rows={noReply} fileBase="complaints-no-reply" /></Section>
        <Section title={t("list.reports.sectionActionTaken", { count: actionTaken.length })}><ReportTable columns={COLS} rows={actionTaken} fileBase="complaints-action-taken" /></Section>
        <Section title={t("list.reports.sectionReplyButNoAction", { count: noAction.length })}><ReportTable columns={COLS} rows={noAction} fileBase="complaints-no-action" /></Section>
        <Section title={t("list.reports.sectionMissingNumber", { count: missingNumber.length })}><ReportTable columns={COLS} rows={missingNumber} fileBase="complaints-missing-number" /></Section>
        <Section title={t("list.reports.sectionOcrReview", { count: ocrReview.length })}><ReportTable columns={DOC_COLS} rows={ocrReview} fileBase="ocr-needing-review" /></Section>
        <Section title={t("list.reports.sectionOcrLowConfidence", { count: lowConf.length })}><ReportTable columns={DOC_COLS} rows={lowConf} fileBase="ocr-low-confidence" /></Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card><CardHeader className="pb-3"><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent>{children}</CardContent></Card>;
}
