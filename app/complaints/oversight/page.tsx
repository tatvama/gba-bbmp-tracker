import Link from "next/link";
import { IndianRupee, ShieldAlert, Copy, Clock, Users, Building2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  getOversightStats,
  getOverdueCounts,
  getContractorIntelligence,
  getDivisionIntelligence,
} from "@/lib/queries";
import { runJobPhotoDuplicateAudit } from "@/lib/forensic/job-photo-dedupe";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_VERIFY_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Forensic oversight dashboard" };

const inr = (n: number) => (n > 0 ? `₹${Math.round(n).toLocaleString("en-IN")}` : "₹0");

const BAND_LABEL: Record<string, string> = {
  bill_stop: "Bill-stop",
  serious: "Serious",
  procedural: "Procedural",
  low: "Low",
  unbanded: "Unbanded",
};

function Stat({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: string; href?: string }) {
  const inner = (
    <Card className="h-full">
      <CardContent className="p-4">
        <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          {icon} {label}
        </div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default async function OversightPage() {
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_VERIFY_ROLES)) {
    return (
      <div>
        <PageHeader title="Forensic oversight dashboard" />
        <EmptyState title="Not permitted" description="Your role cannot view the oversight dashboard." />
      </div>
    );
  }

  const [stats, overdue, contractors, divisions, dupClusters] = await Promise.all([
    getOversightStats(),
    getOverdueCounts(),
    getContractorIntelligence(),
    getDivisionIntelligence(),
    runJobPhotoDuplicateAudit(),
  ]);
  const sameDivDup = dupClusters.filter((c) => c.sameDivisionReuse).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Forensic oversight dashboard"
        description="Platform-wide accountability view. All exposure figures are possible amounts requiring verification; risk bands and patterns are documented suspicions for enquiry, not findings of guilt."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={<IndianRupee className="h-3.5 w-3.5" />} label="Tracked possible exposure" value={inr(stats.totalExposure)} />
        <Stat icon={<ShieldAlert className="h-3.5 w-3.5" />} label="Jobs audited" value={String(stats.jobsAudited)} />
        <Stat icon={<Copy className="h-3.5 w-3.5" />} label="Duplicate-photo clusters" value={`${dupClusters.length}${sameDivDup ? ` (${sameDivDup} same-div)` : ""}`} href="/complaints/duplicate-photos" />
        <Stat icon={<Clock className="h-3.5 w-3.5" />} label="Overdue (complaints · RTI)" value={`${overdue.complaintsOverdue} · ${overdue.rtiDue}`} />
      </div>

      {/* Risk band distribution */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Jobs by risk band</h2>
        {stats.jobsAudited === 0 ? (
          <p className="text-sm text-muted-foreground">No audited jobs yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.bands).map(([band, n]) => (
              <Badge key={band} variant={band === "bill_stop" || band === "serious" ? "destructive" : band === "procedural" ? "warning" : "muted"}>
                {BAND_LABEL[band] ?? band}: {n}
              </Badge>
            ))}
            <Badge variant="muted">Red flags: {stats.redFlags}</Badge>
          </div>
        )}
      </section>

      {/* Leaderboards */}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Users className="h-4 w-4" /> Top contractors by exposure
          </h2>
          <ol className="space-y-1.5 text-sm">
            {contractors.slice(0, 6).map((c) => (
              <li key={c.contractor} className="flex items-center justify-between gap-2">
                <Link href={`/complaints/contractors/${encodeURIComponent(c.contractor)}`} className="min-w-0 truncate underline">{c.contractor}</Link>
                <span className="shrink-0 text-xs text-muted-foreground">{c.jobCount} jobs · {inr(c.totalExposure)}{c.blacklistCandidate ? " ⚑" : ""}</span>
              </li>
            ))}
            {contractors.length === 0 && <li className="text-muted-foreground">No data yet.</li>}
          </ol>
          {contractors.length > 0 && <Link href="/complaints/contractors" className="mt-2 inline-block text-xs underline">All contractors →</Link>}
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Building2 className="h-4 w-4" /> Top divisions by exposure
          </h2>
          <ol className="space-y-1.5 text-sm">
            {divisions.slice(0, 6).map((d) => (
              <li key={d.division} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{d.division}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{d.jobCount} jobs · {inr(d.totalExposure)}</span>
              </li>
            ))}
            {divisions.length === 0 && <li className="text-muted-foreground">No data yet.</li>}
          </ol>
        </section>
      </div>
    </div>
  );
}
