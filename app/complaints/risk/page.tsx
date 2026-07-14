import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getContractorRisk, getCrossJobPatterns } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_VERIFY_ROLES } from "@/lib/constants";
import { ShieldAlert, Copy, MapPin, ScanEye, Clock, GitMerge, Gavel } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "@/lib/i18n/server";
import { translateEnum } from "@/lib/i18n/translate-enum";

const inr = (n: number) => (n > 0 ? `₹${Math.round(n).toLocaleString("en-IN")}` : "—");

export const dynamic = "force-dynamic";
export const metadata = { title: "Risk & Red Flags" };

function Stat({ icon: Icon, label, value, danger }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; danger?: boolean }) {
  return (
    <Card className="px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${danger && value > 0 ? "text-destructive" : "text-muted-foreground"}`} />
        <span className={`text-2xl font-bold tabular-nums ${danger && value > 0 ? "text-destructive" : ""}`}>{value}</span>
      </div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
    </Card>
  );
}

export default async function RiskPage() {
  const { t, locale } = await getTranslations("complaints");
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_VERIFY_ROLES)) {
    return (
      <div>
        <PageHeader title={t("list.risk.title")} />
        <EmptyState title={t("list.notPermittedTitle")} description={t("list.risk.notPermittedDescription")} />
      </div>
    );
  }

  const [{ summary, contractors }, patterns] = await Promise.all([getContractorRisk(), getCrossJobPatterns()]);

  return (
    <div>
      <PageHeader
        title={t("list.risk.title")}
        description={t("list.risk.description")}
        badge={<Badge variant={summary.contractorsAtRisk > 0 ? "destructive" : "success"}>{t("list.risk.contractorsAtRiskBadge", { count: summary.contractorsAtRisk })}</Badge>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Copy} label={t("list.risk.statDuplicatePhotos")} value={summary.duplicateDocs} danger />
        <Stat icon={MapPin} label={t("list.risk.statOffSitePhotos")} value={summary.offSitePhotos} danger />
        <Stat icon={ScanEye} label={t("list.risk.statVisionFlags")} value={summary.visionFlags} danger />
        <Stat icon={Clock} label={t("list.risk.statOverdueFollowUps")} value={summary.overdueComplaints} danger />
      </div>

      {/* Cross-job repeat patterns — the strongest corruption signal. */}
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <GitMerge className="h-4 w-4" /> {t("list.risk.crossJobHeading")}
      </h2>
      {patterns.length === 0 ? (
        <p className="mb-6 text-sm text-muted-foreground">{t("list.risk.noRepeatPatterns")}</p>
      ) : (
        <div className="mb-6 space-y-2">
          {patterns.map((p) => (
            <Card key={p.code} className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={p.severity === "High" ? "destructive" : "warning"}>{translateEnum("workflow", p.severity, locale)}</Badge>
                <span className="text-sm font-semibold">{p.title}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{p.detail}</p>
              {p.jobNumbers.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {p.jobNumbers.map((j) => (
                    <Link key={j} href={`/complaints/job/${encodeURIComponent(j)}/audit`} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs hover:underline">{j}</Link>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <ShieldAlert className="h-4 w-4" /> {t("list.risk.contractorRankingHeading")}
      </h2>
      {contractors.length === 0 ? (
        <EmptyState title={t("list.risk.noContractorSignalsTitle")} description={t("list.risk.noContractorSignalsDescription")} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("detail.contractor")}</TableHead>
              <TableHead className="text-right">{t("list.risk.colRisk")}</TableHead>
              <TableHead className="text-right">{t("list.risk.colBillStop")}</TableHead>
              <TableHead className="text-right">{t("list.risk.colExposure")}</TableHead>
              <TableHead className="text-right">{t("list.risk.colCases")}</TableHead>
              <TableHead className="text-right">{t("list.risk.colDupPhotos")}</TableHead>
              <TableHead className="text-right">{t("list.risk.colOffSite")}</TableHead>
              <TableHead className="text-right">{t("list.risk.colVision")}</TableHead>
              <TableHead className="text-right">{t("list.risk.colOverdue")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contractors.map((c) => (
              <TableRow key={c.contractor}>
                <TableCell className="font-medium">{c.contractor}</TableCell>
                <TableCell className="text-right">
                  <Badge variant={c.score >= 15 ? "destructive" : c.score >= 5 ? "warning" : "muted"}>{c.score}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {c.billStopJobs > 0 ? <span className="font-semibold text-destructive"><Gavel className="mr-0.5 inline h-3 w-3" />{c.billStopJobs}</span> : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{inr(c.totalExposure)}</TableCell>
                <TableCell className="text-right tabular-nums">{c.complaints}</TableCell>
                <TableCell className="text-right tabular-nums">{c.duplicatePhotos || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{c.offSitePhotos || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{c.visionFlags || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{c.overdue || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
