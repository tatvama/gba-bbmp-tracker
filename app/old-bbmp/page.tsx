import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { OldMappingTable } from "@/components/wards/old-mapping-table";
import { EmptyState } from "@/components/empty-state";
import { listWards } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function OldBbmpPage() {
  const wards = await listWards();
  const unmapped = wards.filter((w) => !w.old_wards || w.old_wards.length === 0).length;

  return (
    <div>
      <PageHeader
        title="Old BBMP (198) → 225 mapping"
        description="How the legacy 198-ward map folds into the notified 225 wards. Old-ward lists are captured at the engineering-sub-division level; some are empty where the source scan was ambiguous — those are flagged, never filled."
      />
      {wards.length === 0 ? (
        <EmptyState title="No wards loaded" description="Run the seed to load ward lineage." />
      ) : (
        <>
          {unmapped > 0 && (
            <Card className="mb-4 border-amber/40 bg-amber/5">
              <CardContent className="py-3 text-sm">
                <span className="font-medium">{unmapped}</span> ward
                {unmapped === 1 ? " has" : "s have"} no old-198 mapping captured in the source. They are
                shown as <em>not mapped</em> — missing data stays missing.
              </CardContent>
            </Card>
          )}
          <OldMappingTable data={wards} />
        </>
      )}
    </div>
  );
}
