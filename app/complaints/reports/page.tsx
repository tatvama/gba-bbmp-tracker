import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportTable } from "@/components/reports/report-table";
import { listComplaints, listComplaintDocsForReports } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import type { ComplaintWithRelations } from "@/lib/types";
import { COMPLAINT_OPEN_STATUSES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Complaint reports" };

const COLS = [
  { key: "case", label: "Case no." },
  { key: "title", label: "Title" },
  { key: "ward", label: "Ward" },
  { key: "engineer", label: "Engineer" },
  { key: "status", label: "Status" },
  { key: "given", label: "Given" },
  { key: "followup", label: "Follow-up" },
];

export default async function ComplaintReportsPage() {
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
    { key: "case", label: "Case no." }, { key: "document", label: "Document" }, { key: "type", label: "Type" },
    { key: "ocr", label: "OCR" }, { key: "verification", label: "Verification" }, { key: "confidence", label: "AI conf." },
  ];
  const ocrReview = docs.filter((d) => ["Pending Review", "Low Confidence", "Needs Correction"].includes(d.verification_status) || d.ocr_status === "Needs Manual Review").map(docRow);
  const lowConf = docs.filter((d) => d.ai_confidence === "Low" || d.ocr_status === "Needs Manual Review").map(docRow);

  return (
    <div>
      <PageHeader title="Complaint reports" description="Operational complaint, reply, action-taken, and OCR/document views. Each exports to CSV / XLSX." />
      <div className="space-y-6">
        <Section title={`Pending (${pending.length})`}><ReportTable columns={COLS} rows={pending} fileBase="complaints-pending" /></Section>
        <Section title={`Overdue follow-up (${overdue.length})`}><ReportTable columns={COLS} rows={overdue} fileBase="complaints-overdue" /></Section>
        <Section title={`Filed this month (${filedMonth.length})`}><ReportTable columns={COLS} rows={filedMonth} fileBase="complaints-filed-month" /></Section>
        <Section title={`Reply received (${replyReceived.length})`}><ReportTable columns={COLS} rows={replyReceived} fileBase="complaints-reply-received" /></Section>
        <Section title={`No reply (${noReply.length})`}><ReportTable columns={COLS} rows={noReply} fileBase="complaints-no-reply" /></Section>
        <Section title={`Action taken (${actionTaken.length})`}><ReportTable columns={COLS} rows={actionTaken} fileBase="complaints-action-taken" /></Section>
        <Section title={`Reply but no action (${noAction.length})`}><ReportTable columns={COLS} rows={noAction} fileBase="complaints-no-action" /></Section>
        <Section title={`Missing external complaint number (${missingNumber.length})`}><ReportTable columns={COLS} rows={missingNumber} fileBase="complaints-missing-number" /></Section>
        <Section title={`OCR documents needing review (${ocrReview.length})`}><ReportTable columns={DOC_COLS} rows={ocrReview} fileBase="ocr-needing-review" /></Section>
        <Section title={`Low-confidence OCR documents (${lowConf.length})`}><ReportTable columns={DOC_COLS} rows={lowConf} fileBase="ocr-low-confidence" /></Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card><CardHeader className="pb-3"><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent>{children}</CardContent></Card>;
}
