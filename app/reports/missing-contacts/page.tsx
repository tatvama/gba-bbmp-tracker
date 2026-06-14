import { PageHeader } from "@/components/page-header";
import { ReportTable } from "@/components/reports/report-table";
import { listSubDivisions, listContacts } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function MissingContactsReport() {
  const [subs, contacts] = await Promise.all([listSubDivisions(), listContacts()]);
  const covered = new Set(contacts.map((c) => c.eng_subdivision_id).filter(Boolean));
  const missing = subs.filter((s) => !covered.has(s.id));

  return (
    <div>
      <PageHeader title="Missing engineer contacts" description="Engineering sub-divisions with no officer contact on record." />
      <ReportTable
        fileBase="missing-engineer-contacts"
        columns={[
          { key: "sl_no", label: "Sl." },
          { key: "name", label: "Sub-division" },
          { key: "division", label: "Division" },
        ]}
        rows={missing.map((s) => ({ sl_no: s.sl_no, name: s.name, division: s.division?.name ?? "—" }))}
      />
    </div>
  );
}
