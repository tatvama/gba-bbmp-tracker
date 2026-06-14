import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DetailRow } from "@/components/detail-row";
import { DerivedBadge } from "@/components/badges";
import { ContactCard } from "@/components/contacts/contact-card";
import { EmptyState } from "@/components/empty-state";
import {
  getCorporation,
  listDivisionsForCorporation,
  countDerivedWards,
  listContactsForCorporation,
  getGbaStructure,
} from "@/lib/queries";
import { GbaStructure } from "@/components/corporations/gba-structure";
import { CORP_TINT } from "@/lib/constants";
import { formatNumber, orDash } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CorporationDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const corp = await getCorporation(code);
  if (!corp) notFound();

  const [divisions, derivedWards, contacts, gbaStructure] = await Promise.all([
    listDivisionsForCorporation(corp.id),
    countDerivedWards(corp.id),
    listContactsForCorporation(corp.id),
    getGbaStructure(corp.code),
  ]);
  const tint = CORP_TINT[corp.code] ?? "#8A8478";

  return (
    <div className="mx-auto max-w-5xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-4">
        <Link href="/corporations"><ArrowLeft className="h-4 w-4" /> All corporations</Link>
      </Button>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{corp.name}</h1>
        <Badge style={{ backgroundColor: tint }} className="text-white">{corp.code}</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CountCard label="GBA wards" value={corp.ward_count} />
        <CountCard label="Divisions" value={corp.division_count} />
        <CountCard label="Sub-divisions" value={corp.subdivision_count} />
        <CountCard label="BBMP-225 wards (derived)" value={derivedWards} derived />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Assembly constituencies</CardTitle></CardHeader>
          <CardContent>
            {corp.assembly_constituencies.length === 0 ? (
              <p className="text-sm text-muted-foreground">None listed.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {corp.assembly_constituencies.map((ac) => (
                  <li key={ac}><Badge variant="secondary">{ac}</Badge></li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Overview</CardTitle></CardHeader>
          <CardContent>
            <DetailRow label="Annexure">{orDash(corp.annexure)}</DetailRow>
            <DetailRow label="Address">{orDash(corp.address)}</DetailRow>
          </CardContent>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-xl font-semibold tracking-tight">
        GBA divisions, sub-divisions &amp; wards
      </h2>
      <GbaStructure divisions={gbaStructure} />

      <h2 className="mb-3 mt-8 flex items-center gap-2 text-xl font-semibold tracking-tight">
        BBMP-225 divisions linked via constituency <DerivedBadge />
      </h2>
      {divisions.length === 0 ? (
        <EmptyState title="No divisions derived" description="No BBMP-225 divisions resolve to this corporation." />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {divisions.map((d) => (
            <Link key={d.id} href={`/divisions/${d.id}`} className="rounded-md border p-3 text-sm hover:border-primary/50">
              {d.name}
            </Link>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-8 text-xl font-semibold tracking-tight">Officer contacts</h2>
      {contacts.length === 0 ? (
        <EmptyState title="No contacts on record" description="GBA-specific officer assignments are not yet published." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {contacts.map((c) => <ContactCard key={c.id} contact={c} href={`/contacts/${c.id}`} />)}
        </div>
      )}
    </div>
  );
}

function CountCard({ label, value, derived }: { label: string; value: number; derived?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-2xl font-bold tabular-nums">{formatNumber(value)}</div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {label} {derived && <DerivedBadge />}
        </div>
      </CardContent>
    </Card>
  );
}
