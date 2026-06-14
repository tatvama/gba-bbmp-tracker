import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CorpPill, DerivedBadge } from "@/components/badges";
import { EmptyState } from "@/components/empty-state";
import {
  getDivision,
  listSubDivisionsForDivision,
  listWardsForDivision,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DivisionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const division = await getDivision(id);
  if (!division) notFound();

  const [subs, wards] = await Promise.all([
    listSubDivisionsForDivision(id),
    listWardsForDivision(id),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-4">
        <Link href="/divisions"><ArrowLeft className="h-4 w-4" /> All divisions</Link>
      </Button>

      <PageHeader title={division.name} description="BBMP-225 engineering division">
        {division.corporation && (
          <span className="inline-flex items-center gap-1.5">
            <CorpPill code={division.corporation.code} name={division.corporation.name} derived />
            <DerivedBadge />
          </span>
        )}
      </PageHeader>

      <h2 className="mb-3 font-serif text-xl font-semibold">Engineering sub-divisions ({subs.length})</h2>
      {subs.length === 0 ? (
        <EmptyState title="No sub-divisions" />
      ) : (
        <div className="mb-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {subs.map((s) => (
            <Link key={s.id} href={`/sub-divisions/${s.id}`} className="rounded-md border p-3 text-sm hover:border-primary/50">
              {s.name}{s.sl_no ? <span className="text-muted-foreground"> · sl {s.sl_no}</span> : null}
            </Link>
          ))}
        </div>
      )}

      <h2 className="mb-3 font-serif text-xl font-semibold">Wards ({wards.length})</h2>
      {wards.length === 0 ? (
        <EmptyState title="No wards" />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {wards.map((w) => (
            <Link key={w.id} href={`/wards/${w.new_no}`} className="rounded-md border p-3 text-sm hover:border-primary/50">
              <span className="font-semibold">#{w.new_no}</span> {w.new_name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
