import { PageHeader } from "@/components/page-header";
import { ReportTable } from "@/components/reports/report-table";
import { getRecentlyUpdated } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function RecentReport() {
  const recent = await getRecentlyUpdated(100);
  return (
    <div>
      <PageHeader title="Recently changed" description="Most recently updated contacts." />
      <ReportTable
        fileBase="recently-changed"
        columns={[
          { key: "full_name", label: "Name" },
          { key: "designation", label: "Designation" },
          { key: "status", label: "Status" },
          { key: "updated_at", label: "Updated" },
        ]}
        rows={recent.map((c) => ({
          full_name: c.full_name,
          designation: c.designation,
          status: c.verification_status,
          updated_at: formatDateTime(c.updated_at),
        }))}
      />
    </div>
  );
}
