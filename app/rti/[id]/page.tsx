import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Scale, Gavel, FileSearch } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DetailRow } from "@/components/detail-row";
import { EmptyState } from "@/components/empty-state";
import { PrintButton } from "@/components/print-button";
import { RtiStatusBadge } from "@/components/rti/rti-status-badge";
import { DeadlineBadge } from "@/components/rti/deadline-badge";
import {
  getRti,
  listFirstAppeals,
  listSecondAppeals,
  listAiDrafts,
  listCommunications,
  listAuditLogs,
} from "@/lib/queries";
import { getDeadlineRules } from "@/lib/settings";
import { getSessionUser, hasRole } from "@/lib/auth";
import { RTI_WRITE_ROLES, VERIFY_ROLES, type DeadlineRules } from "@/lib/constants";
import { deadlineStatus, DEADLINE_BUCKET_LABEL } from "@/lib/rti-deadlines";
import { formatDate, formatDateTime, orDash } from "@/lib/format";

export const dynamic = "force-dynamic";

const BUCKET_VARIANT: Record<string, BadgeProps["variant"]> = {
  "due-10plus": "success",
  "due-soon": "warning",
  "due-today": "warning",
  overdue: "destructive",
  "critical-overdue": "destructive",
};

function DueChip({ due, rules }: { due: string | null; rules: DeadlineRules }) {
  if (!due) return <span className="text-muted-foreground">—</span>;
  const bucket = deadlineStatus(due, new Date(), rules);
  return (
    <span className="inline-flex items-center gap-2">
      {formatDate(due)}
      {bucket && <Badge variant={BUCKET_VARIANT[bucket]}>{DEADLINE_BUCKET_LABEL[bucket]}</Badge>}
    </span>
  );
}

export default async function RtiDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rti = await getRti(id);
  if (!rti) notFound();

  const [firstAppeals, secondAppeals, drafts, comms, audit, rules, user] =
    await Promise.all([
      listFirstAppeals(id),
      listSecondAppeals(id),
      listAiDrafts("rti", id),
      listCommunications("rti", id),
      listAuditLogs({ entityType: "rti", entityId: id }, 50),
      getDeadlineRules(),
      getSessionUser(),
    ]);
  const canEdit = hasRole(user, RTI_WRITE_ROLES);
  const canVerify = hasRole(user, VERIFY_ROLES);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="no-print -ml-2">
          <Link href="/rti/all"><ArrowLeft className="h-4 w-4" /> All RTIs</Link>
        </Button>
        <div className="no-print flex flex-wrap gap-2">
          <PrintButton />
          {canEdit && (
            <>
              <Button asChild size="sm" variant="outline">
                <Link href={`/rti/${id}/analyze`}><FileSearch className="h-4 w-4" /> Analyze reply</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={`/rti/${id}/first-appeal`}><Scale className="h-4 w-4" /> First appeal</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={`/rti/${id}/second-appeal`}><Gavel className="h-4 w-4" /> Second appeal</Link>
              </Button>
              <Button asChild size="sm">
                <Link href={`/rti/${id}/edit`}><Pencil className="h-4 w-4" /> Edit</Link>
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="mb-4">
        <p className="font-mono text-xs text-muted-foreground">{rti.internal_ref ?? "—"}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{rti.subject}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <RtiStatusBadge status={rti.status} />
          <Badge variant="outline">{rti.priority} priority</Badge>
          {rti.is_life_liberty && <Badge variant="destructive">Life / liberty</Badge>}
          <DeadlineBadge rti={rti} rules={rules} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Request</CardTitle></CardHeader>
          <CardContent>
            <DetailRow label="Category">{orDash(rti.category)}</DetailRow>
            <DetailRow label="Filing mode">{orDash(rti.filing_mode)}</DetailRow>
            <DetailRow label="Information requested">
              <span className="whitespace-pre-wrap">{orDash(rti.info_requested)}</span>
            </DetailRow>
            <DetailRow label="Tags">{rti.tags.length ? rti.tags.join(", ") : "—"}</DetailRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Statutory deadlines</CardTitle></CardHeader>
          <CardContent>
            <DetailRow label="Date filed">{formatDate(rti.date_filed)}</DetailRow>
            <DetailRow label="Date received">{formatDate(rti.date_received)}</DetailRow>
            <DetailRow label="Normal reply due"><DueChip due={rti.normal_due} rules={rules} /></DetailRow>
            {rti.is_life_liberty && (
              <DetailRow label="Life/liberty due (48h)"><DueChip due={rti.life_liberty_due} rules={rules} /></DetailRow>
            )}
            <DetailRow label="First appeal due"><DueChip due={rti.first_appeal_due} rules={rules} /></DetailRow>
            <DetailRow label="Second appeal due"><DueChip due={rti.second_appeal_due} rules={rules} /></DetailRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Public authority / PIO / FAA</CardTitle></CardHeader>
          <CardContent>
            <DetailRow label="Public authority">{orDash(rti.public_authority)}</DetailRow>
            <DetailRow label="Department">{orDash(rti.department)}</DetailRow>
            <DetailRow label="PIO">{orDash(rti.pio_name)}{rti.pio_designation ? ` · ${rti.pio_designation}` : ""}</DetailRow>
            <DetailRow label="PIO contact">{[rti.pio_phone, rti.pio_email].filter(Boolean).join(" · ") || "—"}</DetailRow>
            <DetailRow label="FAA">{orDash(rti.faa_name)}{rti.faa_designation ? ` · ${rti.faa_designation}` : ""}</DetailRow>
            <DetailRow label="FAA contact">{[rti.faa_phone, rti.faa_email].filter(Boolean).join(" · ") || "—"}</DetailRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Jurisdiction & reply</CardTitle></CardHeader>
          <CardContent>
            <DetailRow label="Corporation">{orDash(rti.corporation?.name)}</DetailRow>
            <DetailRow label="Division">{orDash(rti.division?.name)}</DetailRow>
            <DetailRow label="Sub-division">{orDash(rti.eng_subdivision?.name)}</DetailRow>
            <DetailRow label="Ward">{rti.ward ? `${rti.ward.new_no} · ${rti.ward.new_name}` : "—"}</DetailRow>
            <DetailRow label="Officer on record">{rti.contact ? `${rti.contact.full_name} — ${rti.contact.designation}` : "—"}</DetailRow>
            <DetailRow label="Reply date">{formatDate(rti.reply_date)}</DetailRow>
            <DetailRow label="Satisfaction">{orDash(rti.satisfaction_status)}</DetailRow>
            <DetailRow label="Reply summary"><span className="whitespace-pre-wrap">{orDash(rti.reply_summary)}</span></DetailRow>
          </CardContent>
        </Card>
      </div>

      {(rti.applicant_name || rti.public_notes || (canVerify && rti.internal_notes)) && (
        <Card className="mt-6">
          <CardHeader><CardTitle className="text-base">Applicant & notes</CardTitle></CardHeader>
          <CardContent>
            <DetailRow label="Applicant">{orDash(rti.applicant_name)}</DetailRow>
            <DetailRow label="Applicant contact">{[rti.applicant_phone, rti.applicant_email].filter(Boolean).join(" · ") || "—"}</DetailRow>
            {rti.public_notes && <DetailRow label="Public notes">{rti.public_notes}</DetailRow>}
            {canVerify && rti.internal_notes && <DetailRow label="Internal notes">{rti.internal_notes}</DetailRow>}
          </CardContent>
        </Card>
      )}

      {/* Appeals */}
      <Separator className="my-8" />
      <h2 className="mb-3 font-serif text-xl font-semibold">Appeals</h2>
      {firstAppeals.length === 0 && secondAppeals.length === 0 ? (
        <EmptyState title="No appeals filed" description="First and second appeals will appear here once created." />
      ) : (
        <div className="space-y-3">
          {firstAppeals.map((fa) => (
            <div key={fa.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold">First appeal · {fa.status}</span>
                <span className="text-xs text-muted-foreground">
                  {fa.date_filed ? `Filed ${formatDate(fa.date_filed)}` : "Draft"}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">Grounds: {fa.grounds.join(", ") || "—"}</p>
              {fa.decision_summary && <p className="text-muted-foreground">FAA: {fa.decision_summary}</p>}
            </div>
          ))}
          {secondAppeals.map((sa) => (
            <div key={sa.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Second appeal · {sa.status}</span>
                <span className="text-xs text-muted-foreground">
                  {sa.filing_date ? `Filed ${formatDate(sa.filing_date)}` : "Draft"}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">Reasons: {sa.reason.join(", ") || "—"}</p>
              {sa.diary_number && <p className="text-muted-foreground">Diary: {sa.diary_number}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Communication timeline */}
      {comms.length > 0 && (
        <>
          <Separator className="my-8" />
          <h2 className="mb-3 font-serif text-xl font-semibold">Communication log</h2>
          <ul className="space-y-2 text-sm">
            {comms.map((c) => (
              <li key={c.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.comm_type}{c.contact_person ? ` · ${c.contact_person}` : ""}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(c.occurred_at)}</span>
                </div>
                {c.summary && <p className="text-xs text-muted-foreground">{c.summary}</p>}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Saved AI drafts */}
      {drafts.length > 0 && (
        <>
          <Separator className="my-8" />
          <h2 className="mb-3 font-serif text-xl font-semibold">Saved AI drafts</h2>
          <ul className="space-y-2 text-sm">
            {drafts.map((d) => (
              <li key={d.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize">{d.kind.replace(/_/g, " ")}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(d.created_at)}</span>
                </div>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{d.content}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Audit log */}
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
