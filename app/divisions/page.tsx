import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CorpPill, DerivedBadge } from "@/components/badges";
import { EmptyState } from "@/components/empty-state";
import { listDivisions } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DivisionsPage() {
  const divisions = await listDivisions();

  return (
    <div>
      <PageHeader
        title="Divisions"
        description="BBMP-225 engineering divisions. Each division's GBA corporation is derived from the Assembly Constituencies of its wards."
      />
      {divisions.length === 0 ? (
        <EmptyState title="No divisions loaded" description="Run the seed to load divisions." />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Division</TableHead>
                <TableHead>Derived corporation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {divisions.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <Link href={`/divisions/${d.id}`} className="font-medium text-primary hover:underline">
                      {d.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {d.corporation ? (
                      <span className="inline-flex items-center gap-1.5">
                        <CorpPill code={d.corporation.code} name={d.corporation.name} derived />
                        <DerivedBadge />
                      </span>
                    ) : (
                      <span className="text-xs italic text-muted-foreground">not resolved</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
