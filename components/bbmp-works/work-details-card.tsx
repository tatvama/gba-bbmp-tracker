import { ExternalLink } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DetailRow, DetailGrid } from "@/components/detail-row";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { orDash, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { inrFiguresAndWords, type InrAmount } from "@/lib/format-inr";
import { getSessionUser, hasRole } from "@/lib/auth";
import { WRITE_ROLES } from "@/lib/constants";
import type { BBMPWorkDetails } from "@/lib/bbmp-works/types";
import { WorkVerificationBadge, VerificationDisclaimer } from "./work-verification-badge";
import { SourceCitationList } from "./source-citation-list";
import { RefreshIfmsButton } from "./refresh-ifms-button";

function Money({ amount }: { amount: InrAmount | null }) {
  if (!amount) return <>—</>;
  return (
    <span className="block">
      <span className="font-semibold">{amount.figures}</span>
      <span className="mt-0.5 block text-[10px] font-normal normal-case text-muted-foreground">
        {amount.words}
      </span>
    </span>
  );
}

export async function WorkDetailsCard({ work }: { work: BBMPWorkDetails }) {
  const user = await getSessionUser();
  const canEdit = hasRole(user, WRITE_ROLES);

  const headline = work.workName || (work.jobNumber ? `Job ${work.jobNumber}` : "BBMP work");

  const estimate = work.estimateAmount != null ? inrFiguresAndWords(work.estimateAmount) : null;
  const sanctioned = work.sanctionedAmount != null ? inrFiguresAndWords(work.sanctionedAmount) : null;
  const tenderAmt = work.tenderAmount != null ? inrFiguresAndWords(work.tenderAmount) : null;
  const paid = work.paidAmount != null ? inrFiguresAndWords(work.paidAmount) : null;
  const pending = work.pendingAmount != null ? inrFiguresAndWords(work.pendingAmount) : null;

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1 flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink dark:text-foreground">
            {headline}
          </h1>
          <WorkVerificationBadge status={work.verificationStatus} />
          {work.workStatus && <Badge variant="outline">{work.workStatus}</Badge>}
          {canEdit && work.jobNumber && <RefreshIfmsButton jobNumber={work.jobNumber} />}
        </div>
        <VerificationDisclaimer />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailGrid cols={2}>
              <DetailRow label="Job number">{orDash(work.jobNumber)}</DetailRow>
              <DetailRow label="Work number">{orDash(work.workNumber)}</DetailRow>
              <DetailRow label="Project ID">{orDash(work.projectId)}</DetailRow>
              <DetailRow label="Work category">{orDash(work.workCategory)}</DetailRow>
              <DetailRow label="Work type">{orDash(work.workType)}</DetailRow>
              <DetailRow label="Financial year">{orDash(work.financialYear)}</DetailRow>
              <DetailRow label="Work name" className="sm:col-span-2">
                {orDash(work.workName)}
              </DetailRow>
              <DetailRow label="Description" className="sm:col-span-2">
                {orDash(work.workDescription)}
              </DetailRow>
            </DetailGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Location &amp; administration</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailGrid cols={2}>
              <DetailRow label="Ward number">{orDash(work.wardNumber)}</DetailRow>
              <DetailRow label="Ward name">{orDash(work.wardName)}</DetailRow>
              <DetailRow label="Zone">{orDash(work.zone)}</DetailRow>
              <DetailRow label="Division">{orDash(work.divisionName)}</DetailRow>
              <DetailRow label="Sub-division">{orDash(work.subDivisionName)}</DetailRow>
              <DetailRow label="Department">{orDash(work.departmentName)}</DetailRow>
              <DetailRow label="Scheme">{orDash(work.schemeName)}</DetailRow>
              <DetailRow label="Grant type">{orDash(work.grantType)}</DetailRow>
              <DetailRow label="Budget head">{orDash(work.budgetHead)}</DetailRow>
            </DetailGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Financial</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailGrid cols={2}>
              <DetailRow label="Estimate amount">
                <Money amount={estimate} />
              </DetailRow>
              <DetailRow label="Sanctioned amount">
                <Money amount={sanctioned} />
              </DetailRow>
              <DetailRow label="Tender amount">
                <Money amount={tenderAmt} />
              </DetailRow>
              <DetailRow label="Paid amount">
                <Money amount={paid} />
              </DetailRow>
              <DetailRow label="Pending amount">
                <Money amount={pending} />
              </DetailRow>
              <DetailRow label="Financial progress">
                {work.financialProgress != null ? `${work.financialProgress}%` : "—"}
              </DetailRow>
            </DetailGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tender &amp; work order</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailGrid cols={2}>
              <DetailRow label="Tender number">{orDash(work.tenderNumber)}</DetailRow>
              <DetailRow label="Tender date">{work.tenderDate ? formatDate(work.tenderDate) : "—"}</DetailRow>
              <DetailRow label="Tender status">{orDash(work.tenderStatus)}</DetailRow>
              <DetailRow label="Work order number">{orDash(work.workOrderNumber)}</DetailRow>
              <DetailRow label="Work order date">
                {work.workOrderDate ? formatDate(work.workOrderDate) : "—"}
              </DetailRow>
            </DetailGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Approvals</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailGrid cols={1}>
              <DetailRow label="Administrative approval number">
                {orDash(work.administrativeApprovalNumber)}
              </DetailRow>
              <DetailRow label="Technical sanction number">
                {orDash(work.technicalSanctionNumber)}
              </DetailRow>
            </DetailGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dates</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailGrid cols={1}>
              <DetailRow label="Start date">{work.startDate ? formatDate(work.startDate) : "—"}</DetailRow>
              <DetailRow label="Expected completion">
                {work.expectedCompletionDate ? formatDate(work.expectedCompletionDate) : "—"}
              </DetailRow>
              <DetailRow label="Actual completion">
                {work.actualCompletionDate ? formatDate(work.actualCompletionDate) : "—"}
              </DetailRow>
            </DetailGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status &amp; progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailGrid cols={2}>
              <DetailRow label="Work status">
                {work.workStatus ? <Badge variant="outline">{work.workStatus}</Badge> : "—"}
              </DetailRow>
              <DetailRow label="Physical progress">{orDash(work.physicalProgress)}</DetailRow>
            </DetailGrid>
            {work.progressPercentage != null && (
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Progress</span>
                  <span>{work.progressPercentage}%</span>
                </div>
                <Progress value={work.progressPercentage} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contractor</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailGrid cols={2}>
              <DetailRow label="Name">{orDash(work.contractorName)}</DetailRow>
              <DetailRow label="Registration number">{orDash(work.contractorRegistrationNumber)}</DetailRow>
              <DetailRow label="Phone">{orDash(work.contractorPhone)}</DetailRow>
              <DetailRow label="Email">{orDash(work.contractorEmail)}</DetailRow>
              <DetailRow label="Address" className="sm:col-span-2">
                {orDash(work.contractorAddress)}
              </DetailRow>
            </DetailGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Engineer chain</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailGrid cols={2}>
              <DetailRow label="Engineer">{orDash(work.engineerName)}</DetailRow>
              <DetailRow label="Engineer phone">{orDash(work.engineerPhone)}</DetailRow>
              <DetailRow label="Engineer email">{orDash(work.engineerEmail)}</DetailRow>
              <DetailRow label="Assistant engineer">{orDash(work.assistantEngineer)}</DetailRow>
              <DetailRow label="Assistant executive engineer">
                {orDash(work.assistantExecutiveEngineer)}
              </DetailRow>
              <DetailRow label="Executive engineer">{orDash(work.executiveEngineer)}</DetailRow>
              <DetailRow label="Superintending engineer">{orDash(work.superintendingEngineer)}</DetailRow>
              <DetailRow label="Chief engineer">{orDash(work.chiefEngineer)}</DetailRow>
            </DetailGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Location</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailGrid cols={2}>
              <DetailRow label="Location description" className="sm:col-span-2">
                {orDash(work.locationDescription)}
              </DetailRow>
              <DetailRow label="Road name">{orDash(work.roadName)}</DetailRow>
              <DetailRow label="Layout name">{orDash(work.layoutName)}</DetailRow>
              <DetailRow label="Map" className="sm:col-span-2">
                {work.latitude != null && work.longitude != null ? (
                  <a
                    href={`https://www.google.com/maps?q=${work.latitude},${work.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Open in Google Maps <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  "—"
                )}
              </DetailRow>
            </DetailGrid>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Verification &amp; sources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <DetailGrid cols={3}>
              <DetailRow label="Official source count">{formatNumber(work.officialSourceCount)}</DetailRow>
              <DetailRow label="Latest update">
                {work.latestUpdate ? formatDateTime(work.latestUpdate) : "—"}
              </DetailRow>
              <DetailRow label="Record first added">{formatDateTime(work.createdAt)}</DetailRow>
              <DetailRow label="Record last saved">{formatDateTime(work.updatedAt)}</DetailRow>
            </DetailGrid>
            {work.remarks && (
              <div className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">{work.remarks}</div>
            )}
            <SourceCitationList sources={work.sources} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
