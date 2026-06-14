import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone, Mail, MessageCircle, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailGrid, DetailRow } from "@/components/detail-row";
import { OfficerScorecard } from "@/components/officers/officer-scorecard";
import { TransferTimeline } from "@/components/officers/transfer-timeline";
import { AddTransferForm } from "@/components/officers/add-transfer-form";
import { getOfficer, getOfficerScorecard, listOfficerTransfers, listDirectReports } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { WRITE_ROLES } from "@/lib/constants";
import { orDash, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OfficerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [officer, user] = await Promise.all([getOfficer(id), getSessionUser()]);
  if (!officer) notFound();

  const [scorecard, transfers, reports] = await Promise.all([
    getOfficerScorecard(id),
    listOfficerTransfers(id),
    listDirectReports(id),
  ]);
  const canWrite = hasRole(user, WRITE_ROLES);

  const posting =
    [officer.corporation?.name, officer.division?.name, officer.eng_subdivision?.name]
      .filter(Boolean)
      .join(" / ") || null;

  return (
    <div className="space-y-5">
      <Link href="/officers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All officers
      </Link>

      <PageHeader
        title={officer.full_name}
        description={officer.designation}
        badge={officer.role_level ? <Badge variant="primary-subtle">{officer.role_level}</Badge> : undefined}
      >
        <Link href={`/contacts/${officer.id}`}>
          <Button variant="outline" size="sm">View contact record</Button>
        </Link>
      </PageHeader>

      <OfficerScorecard s={scorecard} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Posting & reporting</CardTitle></CardHeader>
          <CardContent>
            <DetailGrid cols={1}>
              <DetailRow label="Current posting">{orDash(posting)}</DetailRow>
              <DetailRow label="Charge type">{orDash(officer.charge_type)}</DetailRow>
              <DetailRow label="Posting since">{officer.current_posting_start ? formatDate(officer.current_posting_start) : "—"}</DetailRow>
              <DetailRow label="Transfer status">{orDash(officer.transfer_status)}</DetailRow>
              <DetailRow label="Reports to">
                {officer.reporting_officer ? (
                  <Link href={`/officers/${officer.reporting_officer.id}`} className="text-primary hover:underline">
                    {officer.reporting_officer.full_name} ({officer.reporting_officer.designation})
                  </Link>
                ) : "—"}
              </DetailRow>
              <DetailRow label="Contact">
                <span className="flex flex-wrap gap-3 text-sm">
                  {officer.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{officer.phone}</span>}
                  {officer.whatsapp && <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{officer.whatsapp}</span>}
                  {officer.email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{officer.email}</span>}
                  {!officer.phone && !officer.whatsapp && !officer.email && "—"}
                </span>
              </DetailRow>
            </DetailGrid>

            {reports.length > 0 && (
              <div className="mt-4 border-t pt-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  <Users className="h-3.5 w-3.5" /> Direct reports ({reports.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {reports.map((r) => (
                    <Link key={r.id} href={`/officers/${r.id}`}>
                      <Badge variant="muted">{r.full_name} · {r.designation}</Badge>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Transfer history</CardTitle>
            {canWrite && <AddTransferForm officerId={officer.id} />}
          </CardHeader>
          <CardContent>
            <TransferTimeline transfers={transfers} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
