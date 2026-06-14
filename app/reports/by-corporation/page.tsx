import { PageHeader } from "@/components/page-header";
import { ReportTable } from "@/components/reports/report-table";
import { listContacts } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ByCorporationReport() {
  const contacts = await listContacts();
  const rows = contacts
    .map((c) => ({
      corporation: c.corporation?.name ?? "Unassigned",
      division: c.division?.name ?? "—",
      subdivision: c.eng_subdivision?.name ?? "—",
      full_name: c.full_name,
      designation: c.designation,
      phone: c.phone ?? "—",
      status: c.verification_status,
    }))
    .sort((a, b) => a.corporation.localeCompare(b.corporation));

  return (
    <div>
      <PageHeader title="Corporation-wise contacts" description="All contacts grouped by their (derived) corporation." />
      <ReportTable
        fileBase="contacts-by-corporation"
        columns={[
          { key: "corporation", label: "Corporation" },
          { key: "division", label: "Division" },
          { key: "subdivision", label: "Sub-division" },
          { key: "full_name", label: "Name" },
          { key: "designation", label: "Designation" },
          { key: "phone", label: "Phone" },
          { key: "status", label: "Status" },
        ]}
        rows={rows}
      />
    </div>
  );
}
