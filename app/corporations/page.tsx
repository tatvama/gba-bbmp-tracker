import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { listCorporations } from "@/lib/queries";
import { CORP_TINT } from "@/lib/constants";
import { formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CorporationsPage() {
  const corps = await listCorporations();

  return (
    <div>
      <PageHeader
        title="GBA corporations"
        description="The Greater Bengaluru Authority splits the city into 5 corporations — 369 wards across 50 divisions and 150 sub-divisions. Open a corporation for its full ward breakdown. The 225-ward link is derived from each ward's Assembly Constituency."
      />
      {corps.length === 0 ? (
        <EmptyState title="No corporations loaded" description="Run the seed to load the 5 GBA corporations." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {corps.map((c) => {
            const tint = CORP_TINT[c.code] ?? "#8A8478";
            return (
              <Link key={c.id} href={`/corporations/${c.code}`}>
                <Card className="h-full transition-shadow hover:shadow-md" style={{ borderTop: `4px solid ${tint}` }}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <h2 className="font-serif text-xl font-semibold">{c.name}</h2>
                      <Badge style={{ backgroundColor: tint }} className="text-white">{c.code}</Badge>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <Stat label="Wards" value={c.ward_count} />
                      <Stat label="Divisions" value={c.division_count} />
                      <Stat label="Sub-divs" value={c.subdivision_count} />
                    </div>
                    <p className="mt-4 text-xs text-muted-foreground">
                      {c.assembly_constituencies.length} assembly constituencies
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-muted/50 py-2">
      <div className="text-lg font-bold tabular-nums">{formatNumber(value)}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
