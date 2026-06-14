import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { listSubDivisions } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SubDivisionsPage() {
  const subs = await listSubDivisions();

  return (
    <div>
      <PageHeader
        title="Engineering sub-divisions"
        description="The engineer's unit of responsibility. Contacts attach here, and wards inherit the officer through their sub-division. There are 75 in the BBMP-225 system."
      />
      {subs.length === 0 ? (
        <EmptyState title="No sub-divisions loaded" description="Run the seed to load the 75 engineering sub-divisions." />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Sl.</TableHead>
                <TableHead>Sub-division</TableHead>
                <TableHead>Division</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subs.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="tabular-nums text-muted-foreground">{s.sl_no ?? "—"}</TableCell>
                  <TableCell>
                    <Link href={`/sub-divisions/${s.id}`} className="font-medium text-primary hover:underline">
                      {s.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {s.division ? (
                      <Link href={`/divisions/${s.division.id}`} className="hover:underline">{s.division.name}</Link>
                    ) : "—"}
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
