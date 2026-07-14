import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MaterialCalculator } from "@/components/complaints/material-calculator";
import { getFraudAnalytics, getLocationOverlaps } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_VERIFY_ROLES } from "@/lib/constants";
import { BarChart3 } from "lucide-react";
import { getTranslations } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fraud Analytics" };

const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const BENFORD_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  close: "success", acceptable: "success", marginal: "warning", nonconforming: "destructive", insufficient: "muted",
};
const BENFORD_LABEL_KEY: Record<string, string> = {
  close: "list.analytics.benfordClose",
  acceptable: "list.analytics.benfordAcceptable",
  marginal: "list.analytics.benfordMarginal",
  nonconforming: "list.analytics.benfordNonconforming",
  insufficient: "list.analytics.benfordInsufficient",
};

export default async function FraudAnalyticsPage() {
  const { t } = await getTranslations("complaints");
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_VERIFY_ROLES)) {
    return (
      <div>
        <PageHeader title={t("list.analytics.pageTitleCaps")} />
        <EmptyState title={t("list.notPermittedTitle")} description={t("list.analytics.notPermittedDescription")} />
      </div>
    );
  }

  const [a, overlaps] = await Promise.all([getFraudAnalytics(), getLocationOverlaps()]);
  const maxPct = Math.max(0.35, ...a.benford.observedPct, ...a.benford.expectedPct);

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("list.analytics.pageTitle")}
        description={t("list.analytics.description")}
      />

      {/* Benford */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t("list.analytics.benfordCardTitle")}</CardTitle>
          <Badge variant={BENFORD_VARIANT[a.benford.conformity]}>{t(BENFORD_LABEL_KEY[a.benford.conformity] ?? "list.analytics.benfordInsufficient")} (MAD {a.benford.mad.toFixed(4)}, n={a.benford.n})</Badge>
        </CardHeader>
        <CardContent>
          {a.benford.n < 50 ? (
            <p className="text-sm text-muted-foreground">{t("list.analytics.benfordNeedMore", { count: a.benford.n })}</p>
          ) : (
            <svg viewBox="0 0 460 160" className="w-full max-w-xl">
              {a.benford.observedPct.map((o, i) => {
                const x = 20 + i * 48;
                const obsH = (o / maxPct) * 120;
                const expY = 140 - (a.benford.expectedPct[i]! / maxPct) * 120;
                return (
                  <g key={i}>
                    <rect x={x} y={140 - obsH} width={26} height={obsH} className="fill-primary/70" />
                    <line x1={x - 3} y1={expY} x2={x + 29} y2={expY} className="stroke-destructive" strokeWidth={2} />
                    <text x={x + 13} y={154} textAnchor="middle" className="fill-muted-foreground text-[9px]">{i + 1}</text>
                  </g>
                );
              })}
            </svg>
          )}
          <p className="mt-1 text-xs text-muted-foreground">{t("list.analytics.benfordCaption")}</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Thresholds */}
        <Card>
          <CardHeader><CardTitle>{t("list.analytics.thresholdsCardTitle")}</CardTitle></CardHeader>
          <CardContent>
            {a.thresholds.length === 0 ? <p className="text-sm text-muted-foreground">{t("list.analytics.noClustering")}</p> : (
              <ul className="space-y-1 text-sm">
                {a.thresholds.map((th) => (
                  <li key={th.threshold} className="flex justify-between">
                    <span>{t("list.analytics.withinPctBelow", { amount: money(th.threshold) })}</span>
                    <Badge variant={th.count > 1 ? "warning" : "muted"}>{t("list.analytics.billCount", { count: th.count, plural: th.count === 1 ? "" : "s" })}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Outliers */}
        <Card>
          <CardHeader><CardTitle>{t("list.analytics.outliersCardTitle")}</CardTitle></CardHeader>
          <CardContent>
            {a.outliers.high === null ? <p className="text-sm text-muted-foreground">{t("list.analytics.needMoreBills8")}</p>
              : a.outliers.values.length === 0 ? <p className="text-sm text-muted-foreground">{t("list.analytics.noOutliersAbove", { amount: money(a.outliers.high) })}</p>
              : <ul className="space-y-1 text-sm">{a.outliers.values.slice(0, 10).map((v, i) => <li key={i} className="font-medium text-destructive">{money(v)}</li>)}</ul>}
          </CardContent>
        </Card>
      </div>

      {/* Collusion */}
      <Card>
        <CardHeader><CardTitle>{t("list.analytics.collusionCardTitle")}</CardTitle></CardHeader>
        <CardContent>
          {a.collusion.length === 0 ? <p className="text-sm text-muted-foreground">{t("list.analytics.noCollusion")}</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>{t("detail.contractor")}</TableHead><TableHead>{t("list.analytics.colCertifyingOfficer")}</TableHead><TableHead className="text-right">{t("list.analytics.colFlaggedBills")}</TableHead></TableRow></TableHeader>
              <TableBody>
                {a.collusion.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{c.contractor}</TableCell>
                    <TableCell>{c.engineer}</TableCell>
                    <TableCell className="text-right"><Badge variant="destructive">{c.flaggedBills}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Location overlap */}
      <Card>
        <CardHeader><CardTitle>{t("list.analytics.overlapCardTitle")}</CardTitle></CardHeader>
        <CardContent>
          {overlaps.length === 0 ? <p className="text-sm text-muted-foreground">{t("list.analytics.noOverlap")}</p> : (
            <ul className="space-y-2 text-sm">
              {overlaps.slice(0, 25).map((o, i) => (
                <li key={i} className="rounded-md border p-2">
                  <span className="font-medium text-destructive">{t("list.analytics.metersApart", { meters: o.meters })}</span> —{" "}
                  <Link href={`/complaints/${o.a.complaintId}`} className="text-primary hover:underline">{o.a.jobNumber ?? o.a.caseNumber ?? t("list.analytics.caseAFallback")}</Link>
                  {o.a.contractor ? ` (${o.a.contractor})` : ""} ↔{" "}
                  <Link href={`/complaints/${o.b.complaintId}`} className="text-primary hover:underline">{o.b.jobNumber ?? o.b.caseNumber ?? t("list.analytics.caseBFallback")}</Link>
                  {o.b.contractor ? ` (${o.b.contractor})` : ""}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Material balance calculator */}
      <MaterialCalculator />

      {a.amountCount === 0 && overlaps.length === 0 && (
        <EmptyState icon={BarChart3} title={t("list.analytics.noAnalyticsTitle")} description={t("list.analytics.noAnalyticsDescription")} />
      )}
    </div>
  );
}
