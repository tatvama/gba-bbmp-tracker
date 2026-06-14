import { PageHeader } from "@/components/page-header";
import { WardTable } from "@/components/wards/ward-table";
import { listWards } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function WardsPage() {
  const wards = await listWards();

  return (
    <div>
      <PageHeader
        title="Master ward tracking"
        description="All 225 notified BBMP wards with their lineage (old 198 → new 225 → derived GBA corporation), engineering sub-division, property count and verification status. The corporation column is derived from each ward's Assembly Constituency."
      />
      <WardTable data={wards} />
    </div>
  );
}
