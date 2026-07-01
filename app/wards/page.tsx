import { WardsHeader } from "@/components/wards/wards-header";
import { WardTable } from "@/components/wards/ward-table";
import { listWards } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function WardsPage() {
  const wards = await listWards();

  return (
    <div>
      <WardsHeader />
      <WardTable data={wards} />
    </div>
  );
}
