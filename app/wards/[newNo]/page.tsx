import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { VerificationBadge, ConfidenceBadge, DerivedBadge } from "@/components/badges";
import { LineageStrip } from "@/components/lineage";
import { ContactCard } from "@/components/contacts/contact-card";
import { EmptyState } from "@/components/empty-state";
import { DetailRow } from "@/components/detail-row";
import {
  getWard,
  listContactsForSubDivision,
  listComplaintsForWard,
  listAuditLogs,
} from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { WRITE_ROLES } from "@/lib/constants";
import { formatNumber, formatDateTime, orDash } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function WardDetailPage({
  params,
}: {
  params: Promise<{ newNo: string }>;
}) {
  const { newNo } = await params;
  const n = Number(newNo);
  if (!Number.isFinite(n)) notFound();

  const ward = await getWard(n);
  if (!ward) notFound();

  const [contacts, complaints, audit, user] = await Promise.all([
    ward.eng_subdivision_id ? listContactsForSubDivision(ward.eng_subdivision_id) : Promise.resolve([]),
    listComplaintsForWard(ward.id),
    listAuditLogs({ entityType: "ward", entityId: ward.id }, 50),
    getSessionUser(),
  ]);
  const canEdit = hasRole(user, WRITE_ROLES);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="no-print -ml-2">
          <Link href="/wards"><ArrowLeft className="h-4 w-4" /> All wards</Link>
        </Button>
        {canEdit && (
          <Button asChild size="sm" variant="outline" className="no-print">
            <Link href={`/wards/${ward.new_no}/edit`}><Pencil className="h-4 w-4" /> Edit</Link>
          </Button>
        )}
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h1 className="font-serif text-3xl font-semibold text-ink dark:text-foreground">
          Ward #{ward.new_no} · {ward.new_name}
        </h1>
        <VerificationBadge status={ward.verification_status} />
        <ConfidenceBadge score={ward.confidence_score} />
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        {orDash(ward.assembly_constituency)} · Zone {orDash(ward.zone)}
      </p>

      <LineageStrip
        oldWards={ward.old_wards ?? []}
        newNo={ward.new_no}
        newName={ward.new_name}
        corpCode={ward.derived_corporation?.code}
        corpName={ward.derived_corporation?.name}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Ward identity</CardTitle></CardHeader>
          <CardContent className="grid gap-0 sm:grid-cols-2">
            <DetailRow label="BBMP-225 number">#{ward.new_no}</DetailRow>
            <DetailRow label="Ward name">{ward.new_name}</DetailRow>
            <DetailRow label="Property count">{formatNumber(ward.property_count)}</DetailRow>
            <DetailRow label="Zone">{orDash(ward.zone)}</DetailRow>
            <DetailRow label="Assembly constituency">{orDash(ward.assembly_constituency)}</DetailRow>
            <DetailRow label="Division">
              {ward.division ? (
                <Link href={`/divisions/${ward.division.id}`} className="text-primary hover:underline">
                  {ward.division.name}
                </Link>
              ) : "—"}
            </DetailRow>
            <DetailRow label="Engineering sub-division">
              {ward.eng_subdivision ? (
                <Link href={`/sub-divisions/${ward.eng_subdivision.id}`} className="text-primary hover:underline">
                  {ward.eng_subdivision.name}
                  {ward.eng_subdivision.sl_no ? ` (sl ${ward.eng_subdivision.sl_no})` : ""}
                </Link>
              ) : "—"}
            </DetailRow>
            <DetailRow label="Derived corporation">
              {ward.derived_corporation ? (
                <span className="inline-flex items-center gap-2">
                  <Link href={`/corporations/${ward.derived_corporation.code}`} className="text-primary hover:underline">
                    {ward.derived_corporation.name}
                  </Link>
                  <DerivedBadge />
                </span>
              ) : (
                <span className="italic text-muted-foreground">not resolved</span>
              )}
            </DetailRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Provenance</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <DetailRow label="Source">{orDash(ward.source)}</DetailRow>
            <DetailRow label="Source ref">{orDash(ward.source_page)}</DetailRow>
            {ward.notes && (
              <div className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">{ward.notes}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Separator className="my-8" />

      <h2 className="mb-3 font-serif text-xl font-semibold">Engineer / officer (via sub-division)</h2>
      {contacts.length === 0 ? (
        <EmptyState
          title="No officer on record"
          description="Contacts attach at the engineering sub-division level. Add one as GBA publishes assignments."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {contacts.map((c) => (
            <ContactCard key={c.id} contact={c} href={`/contacts/${c.id}`} />
          ))}
        </div>
      )}

      <Separator className="my-8" />

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 font-serif text-xl font-semibold">Related complaints / RTI</h2>
          {complaints.length === 0 ? (
            <EmptyState title="No complaints logged" />
          ) : (
            <ul className="space-y-2">
              {complaints.map((c) => (
                <li key={c.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{c.title}</span>
                    <span className="text-xs uppercase text-muted-foreground">{c.status}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{c.type}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="mb-3 font-serif text-xl font-semibold">Verification history</h2>
          {audit.length === 0 ? (
            <EmptyState title="No recorded changes" description="Edits to this ward will be logged here." />
          ) : (
            <ul className="space-y-2 text-sm">
              {audit.map((a) => (
                <li key={a.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{a.field_name ?? "change"}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(a.changed_at)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {orDash(a.old_value)} → {orDash(a.new_value)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
