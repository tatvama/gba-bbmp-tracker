import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailRow } from "@/components/detail-row";
import { ContactCard } from "@/components/contacts/contact-card";
import { EmptyState } from "@/components/empty-state";
import {
  getSubDivision,
  listWardsForSubDivision,
  listContactsForSubDivision,
} from "@/lib/queries";
import { orDash } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SubDivisionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sub = await getSubDivision(id);
  if (!sub) notFound();

  const [wards, contacts] = await Promise.all([
    listWardsForSubDivision(id),
    listContactsForSubDivision(id),
  ]);

  const openIssues = contacts.filter(
    (c) => c.verification_status !== "VERIFIED",
  ).length;

  return (
    <div className="mx-auto max-w-4xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-4">
        <Link href="/sub-divisions"><ArrowLeft className="h-4 w-4" /> All sub-divisions</Link>
      </Button>

      <PageHeader
        title={sub.name}
        description="Engineering sub-division — the engineer's unit of responsibility."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
          <CardContent>
            <DetailRow label="Sl. no">{sub.sl_no ?? "—"}</DetailRow>
            <DetailRow label="Division">
              {sub.division ? (
                <Link href={`/divisions/${sub.division.id}`} className="text-primary hover:underline">{sub.division.name}</Link>
              ) : "—"}
            </DetailRow>
            <DetailRow label="Address">{orDash(sub.address)}</DetailRow>
            <DetailRow label="Wards covered">{wards.length}</DetailRow>
          </CardContent>
        </Card>

        <Card className={openIssues > 0 ? "border-amber/40" : undefined}>
          <CardHeader><CardTitle className="text-base">Verification</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {openIssues > 0 ? (
              <p className="flex items-center gap-2 text-amber-dark">
                <AlertTriangle className="h-4 w-4" /> {openIssues} contact{openIssues === 1 ? "" : "s"} need verification.
              </p>
            ) : contacts.length > 0 ? (
              <p className="text-teal">All assigned contacts verified.</p>
            ) : (
              <p className="text-muted-foreground">No contacts assigned yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 font-serif text-xl font-semibold">Assigned contacts</h2>
      {contacts.length === 0 ? (
        <EmptyState title="No officer on record" description="Add one as GBA publishes assignments." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {contacts.map((c) => <ContactCard key={c.id} contact={c} href={`/contacts/${c.id}`} />)}
        </div>
      )}

      <h2 className="mb-3 mt-8 font-serif text-xl font-semibold">Wards in this sub-division</h2>
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
