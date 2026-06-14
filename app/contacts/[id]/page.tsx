import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DetailRow } from "@/components/detail-row";
import { ContactCard } from "@/components/contacts/contact-card";
import { ContactTools } from "@/components/contacts/contact-tools";
import { PrintButton } from "@/components/print-button";
import { EmptyState } from "@/components/empty-state";
import { VerificationActions } from "@/components/contacts/verification-actions";
import { getContact, listAuditLogs } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { WRITE_ROLES, VERIFY_ROLES } from "@/lib/constants";
import { formatDate, formatDateTime, orDash } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contact = await getContact(id);
  if (!contact) notFound();

  const [audit, user] = await Promise.all([
    listAuditLogs({ entityType: "contact", entityId: contact.id }, 50),
    getSessionUser(),
  ]);
  const canEdit = hasRole(user, WRITE_ROLES);
  const canVerify = hasRole(user, VERIFY_ROLES);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="no-print -ml-2">
          <Link href="/contacts"><ArrowLeft className="h-4 w-4" /> Directory</Link>
        </Button>
        <div className="no-print flex gap-2">
          <PrintButton />
          {canEdit && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/contacts/${contact.id}/edit`}><Pencil className="h-4 w-4" /> Edit</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ContactCard contact={contact} />

        <Card>
          <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
          <CardContent>
            <DetailRow label="Department">{orDash(contact.department)}</DetailRow>
            <DetailRow label="Jurisdiction notes">{orDash(contact.jurisdiction_notes)}</DetailRow>
            <DetailRow label="Email">{orDash(contact.email)}</DetailRow>
            <DetailRow label="WhatsApp">{orDash(contact.whatsapp)}</DetailRow>
            <DetailRow label="Office timing">{orDash(contact.office_timing)}</DetailRow>
            <DetailRow label="Last verified">{formatDate(contact.last_verified_date)}</DetailRow>
            <DetailRow label="Source">{orDash(contact.source)}{contact.source_page ? ` · ${contact.source_page}` : ""}</DetailRow>
            {contact.public_notes && (
              <DetailRow label="Public notes">{contact.public_notes}</DetailRow>
            )}
            {canVerify && contact.internal_notes && (
              <DetailRow label="Internal notes">{contact.internal_notes}</DetailRow>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <ContactTools contact={contact} />
      </div>

      {canVerify && (
        <>
          <Separator className="my-8" />
          <h2 className="mb-3 font-serif text-xl font-semibold">Verification</h2>
          <VerificationActions contactId={contact.id} current={contact.verification_status} />
        </>
      )}

      <Separator className="my-8" />
      <h2 className="mb-3 font-serif text-xl font-semibold">Change history</h2>
      {audit.length === 0 ? (
        <EmptyState title="No recorded changes" />
      ) : (
        <ul className="space-y-2 text-sm">
          {audit.map((a) => (
            <li key={a.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{a.field_name ?? "change"}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(a.changed_at)}</span>
              </div>
              <p className="text-xs text-muted-foreground">{orDash(a.old_value)} → {orDash(a.new_value)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
