import { PageHeader } from "@/components/page-header";
import { ReportTable } from "@/components/reports/report-table";
import { listContacts } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function PendingVerificationReport() {
  const contacts = await listContacts();
  const pending = contacts.filter((c) => c.verification_status !== "VERIFIED");

  return (
    <div>
      <PageHeader title="Pending verification" description="Contacts not yet verified — prioritise these for field confirmation." />
      <ReportTable
        fileBase="pending-verification"
        columns={[
          { key: "full_name", label: "Name" },
          { key: "designation", label: "Designation" },
          { key: "phone", label: "Phone" },
          { key: "subdivision", label: "Sub-division" },
          { key: "status", label: "Status" },
          { key: "source", label: "Source" },
        ]}
        rows={pending.map((c) => ({
          full_name: c.full_name,
          designation: c.designation,
          phone: c.phone ?? "—",
          subdivision: c.eng_subdivision?.name ?? "—",
          status: c.verification_status,
          source: c.source ?? "—",
        }))}
      />
    </div>
  );
}
