import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { OldMappingTable } from "@/components/divisions/old-mapping-table";
import { EmptyState } from "@/components/empty-state";
import { listDivisions } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Sibling to app/reports/mapping/page.tsx (the ward old/new mapping report),
 * but for divisions. Modeled on app/old-bbmp/page.tsx's chrome (PageHeader +
 * unmapped-count banner + OldMappingTable) rather than reports/mapping's own
 * ReportTable, since that's the pattern already established for an old/new
 * name mapping table with search + CSV export (see memory notes).
 */
export default async function DivisionMappingReport() {
  const divisions = await listDivisions();
  const unmapped = divisions.filter((d) => !d.old_names || d.old_names.length === 0).length;

  return (
    <div>
      <PageHeader
        title="Division old → new name mapping"
        description="How legacy division names fold into the current engineering division names. Old-name lists are captured where the source recorded a rename; some are empty where no rename was on record — those are flagged, never filled."
      />
      {divisions.length === 0 ? (
        <EmptyState title="No divisions loaded" description="Run the seed to load division data." />
      ) : (
        <>
          {unmapped > 0 && (
            <Card className="mb-4 border-amber/40 bg-amber/5">
              <CardContent className="py-3 text-sm">
                <span className="font-medium">{unmapped}</span> division
                {unmapped === 1 ? " has" : "s have"} no old-name mapping captured in the source. They are
                shown as <em>not mapped</em> — missing data stays missing.
              </CardContent>
            </Card>
          )}
          <OldMappingTable data={divisions} />
        </>
      )}
    </div>
  );
}
