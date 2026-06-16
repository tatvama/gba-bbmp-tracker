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

export const dynamic = "force-dynamic";
export const metadata = { title: "Fraud Analytics" };

const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const BENFORD_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  close: "success", acceptable: "success", marginal: "warning", nonconforming: "destructive", insufficient: "muted",
};

export default async function FraudAnalyticsPage() {
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_VERIFY_ROLES)) {
    return (
      <div>
        <PageHeader title="Fraud Analytics" />
        <EmptyState title="Not permitted" description="Your role cannot view fraud analytics. Ask an admin for a Verifier / Complaint Manager / Editor role." />
      </div>
    );
  }

  const [a, overlaps] = await Promise.all([getFraudAnalytics(), getLocationOverlaps()]);
  const maxPct = Math.max(0.35, ...a.benford.observedPct, ...a.benford.expectedPct);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Fraud analytics"
        description="Portfolio-wide statistical signals across all audited bills. Patterns here (digit anomalies, threshold clustering, outliers, collusion, location overlap) are leads for investigation, not proof."
      />

      {/* Benford */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Benford&apos;s Law — first digit of bill amounts</CardTitle>
          <Badge variant={BENFORD_VARIANT[a.benford.conformity]}>{a.benford.conformity} (MAD {a.benford.mad.toFixed(4)}, n={a.benford.n})</Badge>
        </CardHeader>
        <CardContent>
          {a.benford.n < 50 ? (
            <p className="text-sm text-muted-foreground">Need ≥50 audited bills for a meaningful test. Run structured bill audits to populate this ({a.benford.n} so far).</p>
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
          <p className="mt-1 text-xs text-muted-foreground">Bars = observed, red line = Benford-expected. Large gaps suggest manipulated figures.</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Thresholds */}
        <Card>
          <CardHeader><CardTitle>Just below approval limits (splitting)</CardTitle></CardHeader>
          <CardContent>
            {a.thresholds.length === 0 ? <p className="text-sm text-muted-foreground">No clustering detected.</p> : (
              <ul className="space-y-1 text-sm">
                {a.thresholds.map((t) => (
                  <li key={t.threshold} className="flex justify-between">
                    <span>Within 3% below {money(t.threshold)}</span>
                    <Badge variant={t.count > 1 ? "warning" : "muted"}>{t.count} bill{t.count === 1 ? "" : "s"}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Outliers */}
        <Card>
          <CardHeader><CardTitle>High-amount outliers</CardTitle></CardHeader>
          <CardContent>
            {a.outliers.high === null ? <p className="text-sm text-muted-foreground">Need ≥8 audited bills.</p>
              : a.outliers.values.length === 0 ? <p className="text-sm text-muted-foreground">No outliers above {money(a.outliers.high)}.</p>
              : <ul className="space-y-1 text-sm">{a.outliers.values.slice(0, 10).map((v, i) => <li key={i} className="font-medium text-destructive">{money(v)}</li>)}</ul>}
          </CardContent>
        </Card>
      </div>

      {/* Collusion */}
      <Card>
        <CardHeader><CardTitle>Officer ↔ contractor (repeated flagged bills)</CardTitle></CardHeader>
        <CardContent>
          {a.collusion.length === 0 ? <p className="text-sm text-muted-foreground">No officer–contractor pair has ≥2 flagged bills yet.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Contractor</TableHead><TableHead>Certifying officer</TableHead><TableHead className="text-right">Flagged bills</TableHead></TableRow></TableHeader>
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
        <CardHeader><CardTitle>Overlapping work locations (possible double-work)</CardTitle></CardHeader>
        <CardContent>
          {overlaps.length === 0 ? <p className="text-sm text-muted-foreground">No different jobs reported within 60 m of each other.</p> : (
            <ul className="space-y-2 text-sm">
              {overlaps.slice(0, 25).map((o, i) => (
                <li key={i} className="rounded-md border p-2">
                  <span className="font-medium text-destructive">{o.meters} m apart</span> —{" "}
                  <Link href={`/complaints/${o.a.complaintId}`} className="text-primary hover:underline">{o.a.jobNumber ?? o.a.caseNumber ?? "Case A"}</Link>
                  {o.a.contractor ? ` (${o.a.contractor})` : ""} ↔{" "}
                  <Link href={`/complaints/${o.b.complaintId}`} className="text-primary hover:underline">{o.b.jobNumber ?? o.b.caseNumber ?? "Case B"}</Link>
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
        <EmptyState icon={BarChart3} title="No analytics data yet" description="Run structured bill audits (and add lat/lon to complaints) to populate these signals." />
      )}
    </div>
  );
}
