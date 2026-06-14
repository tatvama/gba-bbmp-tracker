import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/print-button";
import { DetailRow } from "@/components/detail-row";
import { getComplaint, listComplaintTimeline, listComplaintDocuments } from "@/lib/queries";
import { formatDate, formatDateTime, orDash } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Complaint case file" };

export default async function ComplaintPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getComplaint(id);
  if (!c) notFound();
  const [timeline, documents] = await Promise.all([listComplaintTimeline(id), listComplaintDocuments(id)]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="-ml-2"><Link href={`/complaints/${id}`}><ArrowLeft className="h-4 w-4" /> Back</Link></Button>
        <PrintButton />
      </div>

      <div className="print-card rounded-lg border p-6">
        <div className="mb-4 border-b pb-3">
          <p className="font-mono text-xs text-muted-foreground">{c.internal_case_number ?? "—"}</p>
          <h1 className="text-2xl font-semibold">{c.title}</h1>
          <p className="text-sm text-muted-foreground">Internal complaint case file</p>
        </div>

        <div className="grid gap-x-8 sm:grid-cols-2">
          <DetailRow label="External complaint no.">{orDash(c.complaint_number)}</DetailRow>
          <DetailRow label="Type">{c.type}{c.complaint_subtype ? ` / ${c.complaint_subtype}` : ""}</DetailRow>
          <DetailRow label="Status">{c.status}</DetailRow>
          <DetailRow label="Priority">{orDash(c.priority)}</DetailRow>
          <DetailRow label="Complaint given">{formatDate(c.date_submitted)}</DetailRow>
          <DetailRow label="Acknowledged">{formatDate(c.acknowledgment_date)}</DetailRow>
          <DetailRow label="Ward / division">{c.ward ? `${c.ward.new_no} ${c.ward.new_name}` : "—"}{c.division ? ` · ${c.division.name}` : ""}</DetailRow>
          <DetailRow label="Engineer / officer">{c.assigned_engineer ? `${c.assigned_engineer.full_name} (${c.assigned_engineer.designation})` : "—"}</DetailRow>
          <DetailRow label="Next follow-up">{formatDate(c.next_follow_up_date)}</DetailRow>
          <DetailRow label="Location">{orDash(c.location)}</DetailRow>
        </div>

        <Block title="Complaint summary">{orDash(c.description)}</Block>
        <Block title="Requested action">{orDash(c.requested_action)}</Block>
        <Block title="Latest reply">{c.latest_reply_date ? `${formatDate(c.latest_reply_date)} — ${orDash(c.latest_reply_summary)}` : "No reply received."}</Block>
        <Block title="Latest action taken">{c.latest_action_taken_date ? `${formatDate(c.latest_action_taken_date)} — ${orDash(c.latest_action_taken_summary)}` : "None recorded."}</Block>

        <div className="mt-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Timeline</h2>
          {timeline.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
            <ul className="space-y-1.5 text-sm">
              {timeline.slice().reverse().map((t) => (
                <li key={t.id}><span className="text-muted-foreground">{formatDateTime(t.event_date)}</span> — <strong>{t.event_type}</strong>: {t.title}{t.summary ? ` — ${t.summary}` : ""}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Documents ({documents.length})</h2>
          {documents.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
            <ul className="space-y-1 text-sm">
              {documents.map((d) => (
                <li key={d.id}>{d.document_type ?? "Document"} — {d.title ?? d.original_file_name ?? "file"} ({formatDate(d.uploaded_at)}) · OCR {d.ocr_status}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <p className="whitespace-pre-wrap text-sm">{children}</p>
    </div>
  );
}
