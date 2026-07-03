import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, FileSearch, Printer, FileDown, ChevronRight } from "lucide-react";
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
import { RtiHeaderActions } from "@/components/rti/rti-header-actions";
import { FilingDateEditor } from "@/components/rti/filing-date-editor";
import { HistoryTimeline } from "@/components/rti/history-timeline";
import { buildRtiHistory } from "@/lib/rti-history";
import { generateInformationSummary } from "@/lib/utils/summary-generator";
import { DocumentSummaryCard } from "@/components/rti/document-summary-card";
import { CaseHealthSidebar } from "@/components/rti/case-health-sidebar";
import { ScrollAnimate } from "@/components/scroll-animate";

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

  let stage = "Initial Application";
  if (rti.status === "Closed") {
    stage = "Case Closed";
  } else if (secondAppeals.some((sa) => sa.status === "Filed" || sa.status === "Hearing Scheduled")) {
    stage = "Second Appeal Stage";
  } else if (firstAppeals.some((fa) => fa.status === "Filed")) {
    stage = "First Appeal Stage";
  }

  return (
    <div className="mx-auto max-w-7xl px-3 md:px-4 lg:px-6 space-y-6">
      {/* 1. PREMIUM CASE HEADER */}
      <ScrollAnimate direction="up">
        <div className="border-b border-border/40 pb-5 space-y-4">
          {/* Breadcrumb & Case Ref */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-muted-foreground font-medium">
              <Link href="/rti/all" className="hover:text-foreground transition-colors">All RTIs</Link>
              <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
              <span className="text-foreground font-semibold">Case Details</span>
            </nav>
            {rti.internal_ref && (
              <span className="font-mono bg-muted/60 text-muted-foreground px-2 py-0.5 rounded border text-[11px] font-bold">
                {rti.internal_ref}
              </span>
            )}
          </div>

          {/* Large Title heading & Status row */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2 max-w-3xl">
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl leading-tight">
                {rti.subject}
              </h1>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <RtiStatusBadge status={rti.status} />
                <Badge variant="outline" className="font-semibold text-[11px]">{rti.priority} priority</Badge>
                {rti.is_life_liberty && <Badge variant="destructive" className="font-bold text-[11px] animate-pulse">Life / liberty</Badge>}
                <span className="text-xs text-muted-foreground/80 font-semibold px-2 py-0.5 rounded-md bg-muted/30 border border-border/40">
                  Stage: {stage}
                </span>
              </div>
            </div>

            {/* Desktop primary actions */}
            <div className="no-print hidden md:flex items-center gap-2">
              {canEdit && (
                <RtiHeaderActions
                  rtiId={id}
                  status={rti.status}
                  canClose={canCloseCase}
                />
              )}
            </div>
          </div>

          {/* Metadata info grid */}
          <div className="grid gap-4.5 sm:grid-cols-2 lg:grid-cols-4 pt-4 border-t border-border/20 text-xs">
            <div className="space-y-1">
              <span className="text-muted-foreground font-semibold block">Public Authority</span>
              <span className="font-bold text-foreground truncate block" title={rti.public_authority ?? undefined}>
                {orDash(rti.public_authority)}
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground font-semibold block">Assigned Officer (PIO)</span>
              <span className="font-bold text-foreground truncate block">
                {orDash(rti.pio_name)}
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground font-semibold block">Filing / Filed Date</span>
              <span className="font-bold text-foreground block">
                {rti.date_filed ? formatDate(rti.date_filed) : "—"}
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground font-semibold block">Statutory SLA Status</span>
              <div className="pt-0.5">
                <DeadlineBadge rti={rtiWithAppealDate} rules={rules} />
              </div>
            </div>
          </div>
        </div>
      </ScrollAnimate>

      {/* 2. EXECUTIVE SUMMARY WORKSPACE */}
      <ScrollAnimate direction="up" delay={0.1}>
        <div className="grid gap-6 md:grid-cols-3 bg-muted/10 border border-border/40 rounded-xl p-6 shadow-3xs">
          {/* Left: AI Summary */}
          <div className="space-y-2 md:border-r border-border/30 md:pr-6">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">AI Executive Summary</h3>
            <p className="text-xs leading-relaxed text-foreground/80 font-medium">
              {rti.reply_summary || "No reply analysis summary indexed yet. Upload the official public authority response document, then run the AI reply extraction workflow."}
            </p>
          </div>

          {/* Center: Information Scope */}
          <div className="space-y-3.5 md:border-r border-border/30 md:px-6">
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground mb-1">Information Scope</h3>
              <p className="text-xs leading-relaxed text-foreground/85 line-clamp-4 font-medium" title={rti.info_requested ?? undefined}>
                {rti.info_requested ?? "No details provided."}
              </p>
            </div>
            {rti.tags && rti.tags.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground/60 uppercase">Key Topics</span>
                <div className="flex flex-wrap gap-1">
                  {rti.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0.5 font-medium">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Quick Statistics */}
          <div className="space-y-2.5 md:pl-6">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Case Statistics</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="space-y-0.5">
                <span className="text-muted-foreground/60 font-semibold block text-[10px] uppercase">Est. Read Time</span>
                <span className="font-bold text-foreground">{Math.max(1, Math.round((rti.info_requested || "").split(/\s+/).length / 200))} min read</span>
              </div>
              <div className="space-y-0.5">
                <span className="text-muted-foreground/60 font-semibold block text-[10px] uppercase">Documents</span>
                <span className="font-bold text-foreground">{documents.length} files</span>
              </div>
              <div className="space-y-0.5">
                <span className="text-muted-foreground/60 font-semibold block text-[10px] uppercase">Reply Status</span>
                <span className="font-bold text-foreground">{rti.satisfaction_status ?? "Pending Review"}</span>
              </div>
              <div className="space-y-0.5">
                <span className="text-muted-foreground/60 font-semibold block text-[10px] uppercase">Priority Class</span>
                <span className="font-bold text-foreground">{rti.priority}</span>
              </div>
            </div>
          </div>
        </div>
      </ScrollAnimate>

      {/* 3. OPERATIONAL WORKSPACE (Two columns on desktop) */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column (Main case workspaces) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Information Requested Document Summary Card */}
          {rti.info_requested && (
            <ScrollAnimate direction="up">
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
            </ScrollAnimate>
          )}

          {/* Statutory Deadlines (Guided Forms Editor) */}
          <ScrollAnimate direction="up">
            <Card>
              <CardHeader className="pb-3 border-b border-border/20">
                <CardTitle className="text-sm font-extrabold uppercase tracking-wider text-muted-foreground/80">SLA Calendar Dates</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 text-xs space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/10 pb-2">
                  <span className="font-semibold text-muted-foreground/80">Filing Date</span>
                  <div>
                    <FilingDateEditor rtiId={id} dateFiled={rti.date_filed} canEdit={canEdit} />
                  </div>
                </div>
                <div className="flex justify-between items-center border-b border-border/10 pb-2">
                  <span className="font-semibold text-muted-foreground/80">Normal Reply Due</span>
                  <DueChip due={rti.normal_due} rules={rules} />
                </div>
                {rti.is_life_liberty && (
                  <div className="flex justify-between items-center border-b border-border/10 pb-2 text-rose-600 dark:text-rose-400">
                    <span className="font-bold">Life/Liberty Due (48h)</span>
                    <DueChip due={rti.life_liberty_due} rules={rules} />
                  </div>
                )}
                <div className="flex justify-between items-center border-b border-border/10 pb-2">
                  <span className="font-semibold text-muted-foreground/80">First Appeal Due</span>
                  <DueChip due={rti.first_appeal_due} rules={rules} />
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-muted-foreground/80">Second Appeal Due</span>
                  <DueChip due={rti.second_appeal_due} rules={rules} />
                </div>
              </CardContent>
            </Card>
          </ScrollAnimate>

          {/* Document Management Workspace */}
          <ScrollAnimate direction="up">
            <RtiDocumentsPanel rtiId={id} documents={documents} canEdit={canEdit} />
          </ScrollAnimate>

          {/* Appeals Details Panel */}
          {(firstAppeals.length > 0 || secondAppeals.length > 0) && (
            <ScrollAnimate direction="up">
              <Card>
                <CardHeader className="pb-3 border-b border-border/20">
                  <CardTitle className="text-sm font-extrabold uppercase tracking-wider text-muted-foreground/80">Appeals Workspace</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  {firstAppeals.map((fa) => {
                    const faSum = faSummaries.find((s) => s.id === fa.id)?.summary;
                    return (
                      <div key={fa.id} className="rounded-xl border p-5 space-y-3 bg-muted/5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-foreground">First Appeal · {fa.status}</span>
                          <span className="text-[11px] text-muted-foreground/80 font-semibold bg-muted/60 border px-2 py-0.5 rounded-md">
                            {fa.date_filed ? `Filed ${formatDate(fa.date_filed)}` : "Draft"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">Grounds: {fa.grounds.join(", ") || "—"}</p>
                        {fa.grounds_detail && faSum && (
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
                        )}
                        {fa.decision_summary && <p className="text-xs text-muted-foreground">FAA Decision: {fa.decision_summary}</p>}
                        
                        <div className="flex gap-2 pt-1">
                          <Button asChild size="sm" variant="outline" className="h-7 text-xs bg-white dark:bg-slate-900 border-border/60">
                            <Link href={`/rti/${id}/print?type=first_appeal&appealId=${fa.id}`} target="_blank">
                              <Printer className="h-3 w-3 mr-1" /> Print Appeal
                            </Link>
                          </Button>
                          <Button asChild size="sm" variant="outline" className="h-7 text-xs bg-white dark:bg-slate-900 border-border/60">
                            <a href={`/api/rti/${id}/first-appeal/pdf?appealId=${fa.id}`} download>
                              <FileDown className="h-3 w-3 mr-1" /> Download PDF
                            </a>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  
                  {secondAppeals.map((sa) => {
                    const saSum = saSummaries.find((s) => s.id === sa.id)?.summary;
                    return (
                      <div key={sa.id} className="rounded-xl border p-5 space-y-3 bg-muted/5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-foreground">Second Appeal · {sa.status}</span>
                          <span className="text-[11px] text-muted-foreground/80 font-semibold bg-muted/60 border px-2 py-0.5 rounded-md">
                            {sa.filing_date ? `Filed ${formatDate(sa.filing_date)}` : "Draft"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">Reasons: {sa.reason.join(", ") || "—"}</p>
                        {sa.reason_detail && saSum && (
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
                        )}
                        {sa.diary_number && <p className="text-xs text-muted-foreground font-mono">Diary Code: {sa.diary_number}</p>}
                        
                        <div className="flex gap-2 pt-1">
                          <Button asChild size="sm" variant="outline" className="h-7 text-xs bg-white dark:bg-slate-900 border-border/60">
                            <Link href={`/rti/${id}/print?type=second_appeal&appealId=${sa.id}`} target="_blank">
                              <Printer className="h-3 w-3 mr-1" /> Print Appeal
                            </Link>
                          </Button>
                          <Button asChild size="sm" variant="outline" className="h-7 text-xs bg-white dark:bg-slate-900 border-border/60">
                            <a href={`/api/rti/${id}/second-appeal/pdf?appealId=${sa.id}`} download>
                              <FileDown className="h-3 w-3 mr-1" /> Download PDF
                            </a>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </ScrollAnimate>
          )}

          {/* Communication Timeline */}
          {comms.length > 0 && (
            <ScrollAnimate direction="up">
              <Card>
                <CardHeader className="pb-3 border-b border-border/20">
                  <CardTitle className="text-sm font-extrabold uppercase tracking-wider text-muted-foreground/80">Communication Ledger</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <ul className="space-y-3.5 text-xs">
                    {comms.map((c) => (
                      <li key={c.id} className="rounded-xl border p-5 bg-muted/5 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-foreground text-[13px]">{c.comm_type}{c.contact_person ? ` · ${c.contact_person}` : ""}</span>
                          <span className="text-[10px] text-muted-foreground/75 font-semibold font-mono">{formatDateTime(c.occurred_at)}</span>
                        </div>
                        {c.summary && <p className="leading-relaxed text-muted-foreground/90 font-medium">{c.summary}</p>}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </ScrollAnimate>
          )}

          {/* Change History Timeline */}
          <ScrollAnimate direction="up">
            <Card>
              <CardHeader className="pb-3 border-b border-border/20">
                <CardTitle className="text-sm font-extrabold uppercase tracking-wider text-muted-foreground/80">Audit Change Ledger</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <HistoryTimeline events={buildRtiHistory(rti, documents, audit)} />
              </CardContent>
            </Card>
          </ScrollAnimate>

          {/* Supporting Information (Applicant & Metadata) */}
          <ScrollAnimate direction="up">
            <Card>
              <CardHeader className="pb-3 border-b border-border/20">
                <CardTitle className="text-sm font-extrabold uppercase tracking-wider text-muted-foreground/80">Supporting Case Metadata</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 grid gap-5 sm:grid-cols-2 md:grid-cols-3 text-xs">
                <div className="space-y-1">
                  <span className="text-muted-foreground/75 font-semibold block">Applicant Name</span>
                  <span className="font-bold text-foreground text-sm block">{orDash(rti.applicant_name)}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-muted-foreground/75 font-semibold block">Contact Details</span>
                  <span className="font-bold text-foreground text-sm block">
                    {[rti.applicant_phone, rti.applicant_email].filter(Boolean).join(" · ") || "—"}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-muted-foreground/75 font-semibold block">Public Authority Group</span>
                  <span className="font-bold text-foreground text-sm block">{orDash(rti.public_authority)}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-muted-foreground/75 font-semibold block">Filing Mode</span>
                  <span className="font-bold text-foreground text-sm block">{orDash(rti.filing_mode)}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-muted-foreground/75 font-semibold block">Online Reference ID</span>
                  <span className="font-bold text-foreground text-sm block font-mono">{orDash(rti.online_reg_no)}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-muted-foreground/75 font-semibold block">Postal Receipt Number</span>
                  <span className="font-bold text-foreground text-sm block font-mono">{orDash(rti.postal_receipt_no)}</span>
                </div>
                {rti.public_notes && (
                  <div className="sm:col-span-2 md:col-span-3 space-y-1 pt-2 border-t border-border/10">
                    <span className="text-muted-foreground/75 font-semibold block">Public Notes</span>
                    <p className="text-foreground/85 leading-relaxed font-medium">{rti.public_notes}</p>
                  </div>
                )}
                {canVerify && rti.internal_notes && (
                  <div className="sm:col-span-2 md:col-span-3 space-y-1 pt-2 border-t border-border/10 text-rose-700 dark:text-rose-400">
                    <span className="font-bold block text-[10px] uppercase tracking-wider">Internal Operations Notes (Verifier Only)</span>
                    <p className="leading-relaxed font-medium">{rti.internal_notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </ScrollAnimate>
        </div>

        {/* Right Column (Sticky Health Sidebar & Deadlines Stepper) */}
        <div className="lg:col-span-1">
          <ScrollAnimate direction="up" delay={0.15}>
            <CaseHealthSidebar
              rti={rti}
              documents={documents}
              firstAppeals={firstAppeals}
              secondAppeals={secondAppeals}
              rules={rules}
            />
          </ScrollAnimate>
        </div>
      </div>

      {/* Sticky Contextual Action Bar */}
      <ScrollAnimate direction="up" delay={0.2}>
        <div className="sticky bottom-4 left-0 right-0 z-30 border border-border/50 bg-background/90 px-6 py-4.5 backdrop-blur-md flex items-center justify-between shadow-lg rounded-xl mt-8 no-print">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-teal-500 animate-pulse" />
            <span className="text-xs font-extrabold text-muted-foreground/80 uppercase tracking-wider">
              Case Ref: {rti.internal_ref || rti.id.slice(0, 8)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button asChild size="sm" variant="outline" className="font-semibold text-xs bg-white dark:bg-slate-900 border-border/60">
              <Link href={`/rti/${id}/print?type=rti`} target="_blank">
                <Printer className="h-3.5 w-3.5 mr-1" /> Print Case
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="font-semibold text-xs bg-white dark:bg-slate-900 border-border/60">
              <a href={`/api/rti/${id}/pdf`} download>
                <FileDown className="h-3.5 w-3.5 mr-1" /> Download PDF
              </a>
            </Button>
            {canEdit && (
              <Button asChild size="sm" variant="default" className="font-semibold text-xs">
                <Link href={`/rti/${id}/edit`}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit Case
                </Link>
              </Button>
            )}
          </div>
        </div>
      </ScrollAnimate>
    </div>
  );
}
