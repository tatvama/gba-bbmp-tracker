import { PageHeader } from "@/components/page-header";
import { ReportTable } from "@/components/reports/report-table";
import { listComplaints } from "@/lib/queries";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ComplaintsPendingReport() {
  const all = await listComplaints();
  const pending = all.filter((c) => c.status !== "Closed" && c.status !== "Resolved");

  return (
    <div>
      <PageHeader title="Complaint / RTI pending" description="All complaints and RTI filings that are not yet closed." />
      <ReportTable
        fileBase="complaints-pending"
        columns={[
          { key: "title", label: "Title" },
          { key: "type", label: "Type" },
          { key: "status", label: "Status" },
          { key: "number", label: "Ref no." },
          { key: "due", label: "Due" },
          { key: "next", label: "Next action" },
        ]}
        rows={pending.map((c) => ({
          title: c.title,
          type: c.type,
          status: c.status,
          number: c.complaint_number ?? c.rti_number ?? "—",
          due: formatDate(c.due_date),
          next: formatDate(c.next_action_date),
        }))}
      />
    </div>
  );
}
