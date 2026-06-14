import { PageHeader } from "@/components/page-header";
import { ReportTable } from "@/components/reports/report-table";
import { listWards } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function MappingReport() {
  const wards = await listWards();

  return (
    <div>
      <PageHeader title="Ward → sub-division mapping" description="Full lineage. The corporation column is derived from each ward's Assembly Constituency." />
      <ReportTable
        fileBase="ward-subdivision-mapping"
        columns={[
          { key: "new_no", label: "Ward #" },
          { key: "new_name", label: "Ward" },
          { key: "old_wards", label: "Old · 198" },
          { key: "division", label: "Division" },
          { key: "subdivision", label: "Eng. sub-division" },
          { key: "ac", label: "AC" },
          { key: "corporation", label: "Corporation (derived)" },
        ]}
        rows={wards.map((w) => ({
          new_no: w.new_no,
          new_name: w.new_name,
          old_wards: (w.old_wards ?? []).join("; ") || "not mapped",
          division: w.division?.name ?? "—",
          subdivision: w.eng_subdivision?.name ?? "—",
          ac: w.assembly_constituency ?? "—",
          corporation: w.derived_corporation?.name ?? "not resolved",
        }))}
      />
    </div>
  );
}
