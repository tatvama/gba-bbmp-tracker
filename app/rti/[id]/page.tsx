import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, FileSearch, Printer, FileDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DetailRow } from "@/components/detail-row";
import { EmptyState } from "@/components/empty-state";
import { RtiStatusBadge } from "@/components/rti/rti-status-badge";
import { DeadlineBadge } from "@/components/rti/deadline-badge";
import {
  getRti,
  listFirstAppeals,
  listSecondAppeals,
  listRtiDocuments,
  listCommunications,
  listAuditLogs,
} from "@/lib/queries";
import { getDeadlineRules } from "@/lib/settings";
import { getSessionUser, hasRole } from "@/lib/auth";
import { RTI_WRITE_ROLES, VERIFY_ROLES, type DeadlineRules } from "@/lib/constants";
import { deadlineStatus, DEADLINE_BUCKET_LABEL } from "@/lib/rti-deadlines";
import { formatDate, formatDateTime, orDash } from "@/lib/format";
import { RtiDocumentsPanel } from "@/components/rti/rti-documents-panel";
import { CloseCaseButton } from "@/components/rti/close-case-button";
import { FilingDateEditor } from "@/components/rti/filing-date-editor";
import { HistoryTimeline } from "@/components/rti/history-timeline";
import { buildRtiHistory } from "@/lib/rti-history";
import { generateInformationSummary } from "@/lib/utils/summary-generator";
import { DocumentSummaryCard } from "@/components/rti/document-summary-card";

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

  const [firstAppeals, secondAppeals, documents, comms, audit, rules, user] =
    await Promise.all([
      listFirstAppeals(id),
      listSecondAppeals(id),
      listRtiDocuments(id),
      listCommunications("rti", id),
      listAuditLogs({ entityType: "rti", entityId: id }, 50),
      getDeadlineRules(),
      getSessionUser(),
    ]);
  const canEdit = hasRole(user, RTI_WRITE_ROLES);
  const canVerify = hasRole(user, VERIFY_ROLES);

  // A case can be closed only once an official response/order is on file —
  // an Application / Acknowledgement alone is not enough.
  const CLOSEABLE_DOC_TYPES = new Set(["Reply", "FAA Order", "Second Appeal Order", "Higher Appeal Order"]);
  const canCloseCase = documents.some((d) => CLOSEABLE_DOC_TYPES.has(d.doc_type));

  // Pre-generate summaries on the server for optimal client load performance
  const rtiSummary = generateInformationSummary(rti.info_requested);

  const faSummaries = firstAppeals.map((fa) => ({
    id: fa.id,
    summary: generateInformationSummary(fa.grounds_detail),
  }));

  const saSummaries = secondAppeals.map((sa) => ({
    id: sa.id,
    summary: generateInformationSummary(sa.reason_detail),
  }));

  const filedFirstAppeal = firstAppeals.find((fa) => fa.status === "Filed");
  const rtiWithAppealDate = {
    ...rti,
    first_appeal_filed_date: filedFirstAppeal?.date_filed || null,
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between animate-blur-reveal">
        <Button asChild variant="ghost" size="sm" className="no-print -ml-2">
          <Link href="/rti/all"><ArrowLeft className="h-4 w-4" /> All RTIs</Link>
        </Button>
        <div className="no-print flex flex-wrap gap-2">
          {canEdit && (
            <>
              <Button asChild size="sm" variant="outline">
                <Link href={`/rti/${id}/analyze`}><FileSearch className="h-4 w-4" /> Analyze reply</Link>
              </Button>
              <CloseCaseButton rtiId={id} status={rti.status} canClose={canCloseCase} />
              <Button asChild size="sm">
                <Link href={`/rti/${id}/edit`}><Pencil className="h-4 w-4" /> Edit</Link>
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="mb-4 animate-blur-reveal">
        <p className="font-mono text-xs text-muted-foreground">{rti.internal_ref ?? "—"}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{rti.subject}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <RtiStatusBadge status={rti.status} />
          <Badge variant="outline">{rti.priority} priority</Badge>
          {rti.is_life_liberty && <Badge variant="destructive">Life / liberty</Badge>}
          <DeadlineBadge rti={rtiWithAppealDate} rules={rules} />
        </div>
      </div>

      {/* Main RTI Full-Width Document Summary Card */}
      {rti.info_requested && (
        <div className="mb-6 animate-blur-reveal stagger-1">
          <DocumentSummaryCard
            title="Information Requested"
            content={rti.info_requested}
            summary={rtiSummary}
            documentType="RTI Application"
            lastUpdatedDate={rti.updated_at}
            printUrl={`/rti/${id}/print?type=rti`}
            pdfUrl={`/api/rti/${id}/pdf`}
            variant="standalone"
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2 animate-blur-reveal stagger-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Request</CardTitle></CardHeader>
          <CardContent>
            <DetailRow label="Category">{orDash(rti.category)}</DetailRow>
            <DetailRow label="Public authority">{orDash(rti.public_authority)}</DetailRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Statutory deadlines</CardTitle></CardHeader>
          <CardContent>
            <DetailRow label="Date filed">
              <FilingDateEditor rtiId={id} dateFiled={rti.date_filed} canEdit={canEdit} />
            </DetailRow>
            <DetailRow label="Normal reply due"><DueChip due={rti.normal_due} rules={rules} /></DetailRow>
            {rti.is_life_liberty && (
              <DetailRow label="Life/liberty due (48h)"><DueChip due={rti.life_liberty_due} rules={rules} /></DetailRow>
            )}
            <DetailRow label="First appeal due"><DueChip due={rti.first_appeal_due} rules={rules} /></DetailRow>
            <DetailRow label="Second appeal due"><DueChip due={rti.second_appeal_due} rules={rules} /></DetailRow>
          </CardContent>
        </Card>
      </div>

      <div className="animate-blur-reveal stagger-3">
        <RtiDocumentsPanel rtiId={id} documents={documents} canEdit={canEdit} />
      </div>

      {(rti.applicant_name || rti.public_notes || (canVerify && rti.internal_notes)) && (
        <Card className="mt-6 animate-blur-reveal stagger-4">
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
      {(firstAppeals.length > 0 || secondAppeals.length > 0) && (
        <>
          <Separator className="my-8" />
          <h2 className="mb-3 font-serif text-xl font-semibold">Appeals</h2>
          <div className="space-y-3">
            {firstAppeals.map((fa) => {
              const faSum = faSummaries.find((s) => s.id === fa.id)?.summary;
              return (
                <div key={fa.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">First appeal · {fa.status}</span>
                    <span className="text-xs text-muted-foreground">
                      {fa.date_filed ? `Filed ${formatDate(fa.date_filed)}` : "Draft"}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">Grounds: {fa.grounds.join(", ") || "—"}</p>
                  {fa.grounds_detail && faSum && (
                    <div className="mt-2">
                      <DocumentSummaryCard
                        title="Appeal Grounds Detail"
                        content={fa.grounds_detail}
                        summary={faSum}
                        documentType="First Appeal"
                        lastUpdatedDate={fa.updated_at}
                        printUrl={`/rti/${id}/print?type=first_appeal&appealId=${fa.id}`}
                        pdfUrl={`/api/rti/${id}/first-appeal/pdf?appealId=${fa.id}`}
                        variant="nested"
                      />
                    </div>
                  )}
                  {fa.decision_summary && <p className="mt-1 text-muted-foreground">FAA: {fa.decision_summary}</p>}
                  
                  <div className="mt-2 flex gap-2">
                    <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                      <Link href={`/rti/${id}/print?type=first_appeal&appealId=${fa.id}`} target="_blank">
                        <Printer className="h-3 w-3 mr-1" /> Print
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                      <a href={`/api/rti/${id}/first-appeal/pdf?appealId=${fa.id}`} download>
                        <FileDown className="h-3 w-3 mr-1" /> PDF
                      </a>
                    </Button>
                  </div>
                </div>
              );
            })}
            {secondAppeals.map((sa) => {
              const saSum = saSummaries.find((s) => s.id === sa.id)?.summary;
              return (
                <div key={sa.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Second appeal · {sa.status}</span>
                    <span className="text-xs text-muted-foreground">
                      {sa.filing_date ? `Filed ${formatDate(sa.filing_date)}` : "Draft"}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">Reasons: {sa.reason.join(", ") || "—"}</p>
                  {sa.reason_detail && saSum && (
                    <div className="mt-2">
                      <DocumentSummaryCard
                        title="Appeal Reason Detail"
                        content={sa.reason_detail}
                        summary={saSum}
                        documentType="Second Appeal"
                        lastUpdatedDate={sa.updated_at}
                        printUrl={`/rti/${id}/print?type=second_appeal&appealId=${sa.id}`}
                        pdfUrl={`/api/rti/${id}/second-appeal/pdf?appealId=${sa.id}`}
                        variant="nested"
                      />
                    </div>
                  )}
                  {sa.diary_number && <p className="mt-1 text-muted-foreground">Diary: {sa.diary_number}</p>}
                  
                  <div className="mt-2 flex gap-2">
                    <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                      <Link href={`/rti/${id}/print?type=second_appeal&appealId=${sa.id}`} target="_blank">
                        <Printer className="h-3 w-3 mr-1" /> Print
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                      <a href={`/api/rti/${id}/second-appeal/pdf?appealId=${sa.id}`} download>
                        <FileDown className="h-3 w-3 mr-1" /> PDF
                      </a>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
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

      {/* Change history — unified activity timeline */}
      <Separator className="my-8" />
      <h2 className="mb-5 font-serif text-xl font-semibold">Change history</h2>
      <HistoryTimeline events={buildRtiHistory(rti, documents, audit)} />
    </div>
  );
}
