import Link from "next/link";
import {
  Building2,
  Map,
  Network,
  Wrench,
  Users,
  ShieldCheck,
  Clock,
  PhoneOff,
  GitMerge,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  StatCard,
  StatCardRow,
  StatCardIcon,
  StatCardValue,
  StatCardLabel,
  StatCardSub,
} from "@/components/ui/stat-card";
import { VerificationBadge, UnverifiedSeedTag } from "@/components/badges";
import { EmptyState } from "@/components/empty-state";
import {
  getDashboardStats,
  getRecentlyUpdated,
  getNeedsVerification,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [stats, recent, needs] = await Promise.all([
    getDashboardStats(),
    getRecentlyUpdated(6),
    getNeedsVerification(6),
  ]);

  const statCards = [
    {
      label: "Corporations",
      sub: "GBA units",
      value: stats.corporations,
      icon: Building2,
      href: "/corporations",
      iconCls: "text-primary",
      bgCls: "bg-primary/8",
    },
    {
      label: "GBA wards",
      sub: "5 corporations",
      value: stats.gbaWards,
      icon: Map,
      href: "/corporations",
      iconCls: "text-teal",
      bgCls: "bg-teal/8",
    },
    {
      label: "BBMP-225 wards",
      sub: "notified wards",
      value: stats.bbmp225Wards,
      icon: Map,
      href: "/wards",
      iconCls: "text-primary",
      bgCls: "bg-primary/8",
    },
    {
      label: "Old-198 mapped",
      sub: "historical wards",
      value: stats.old198Represented,
      icon: GitMerge,
      href: "/old-bbmp",
      iconCls: "text-teal",
      bgCls: "bg-teal/8",
    },
    {
      label: "Divisions",
      sub: "BBMP divisions",
      value: stats.divisions,
      icon: Network,
      href: "/divisions",
      iconCls: "text-primary",
      bgCls: "bg-primary/8",
    },
    {
      label: "Sub-divisions",
      sub: "engineering units",
      value: stats.subdivisions,
      icon: Wrench,
      href: "/sub-divisions",
      iconCls: "text-teal",
      bgCls: "bg-teal/8",
    },
    {
      label: "Contacts",
      sub: "officers on record",
      value: stats.contacts,
      icon: Users,
      href: "/contacts",
      iconCls: "text-primary",
      bgCls: "bg-primary/8",
    },
    {
      label: "Verified",
      sub: "confirmed contacts",
      value: stats.verified,
      icon: ShieldCheck,
      href: "/contacts?status=VERIFIED",
      iconCls: "text-teal",
      bgCls: "bg-teal/8",
    },
    {
      label: "Pending",
      sub: "awaiting review",
      value: stats.pending,
      icon: Clock,
      href: "/contacts?status=PENDING",
      iconCls: "text-amber-dark",
      bgCls: "bg-amber/8",
    },
    {
      label: "Missing details",
      sub: "phone / email / address",
      value: stats.missingContactInfo,
      icon: PhoneOff,
      href: "/reports/missing-contacts",
      iconCls: "text-destructive",
      bgCls: "bg-destructive/8",
    },
  ];

  const noData = stats.bbmp225Wards === 0 && stats.corporations === 0;

  return (
    <div className="space-y-8 animate-page-slide">
      <PageHeader
        title="Bengaluru Ward & Engineer Tracker"
        description="Trace localities across the 198 → 225 → 369 ward restructures and reach the responsible engineering sub-division."
        breadcrumbs={[{ label: "Dashboard" }]}
      />

      {noData && (
        <div className="flex items-start gap-3 rounded-xl border border-amber/40 bg-amber/5 p-4 text-sm">
          <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-amber-dark" />
          <span>
            <span className="font-semibold">No data yet. </span>
            Run{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              npm run db:migrate
            </code>{" "}
            then{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              npm run db:seed
            </code>{" "}
            to load wards, sub-divisions and corporations.
          </span>
        </div>
      )}

      {/* Executive Overview Banner */}
      <div className="relative overflow-hidden rounded-xl border border-border/50 bg-card p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4.5 bg-gradient-to-r from-card via-card to-primary/[0.015]">
        <div className="space-y-1 max-w-3xl">
          <h2 className="text-sm font-bold text-foreground/90 uppercase tracking-wider">System Executive Summary</h2>
          <p className="text-sm text-muted-foreground/90 leading-relaxed font-medium">
            Bengaluru is currently transitioning to the **369 GBA ward structure**. Out of the notified **225 BBMP wards**, 
            the system has mapped **{stats.old198Represented} legacy wards**. Of the **{stats.contacts}** contact profiles on record, 
            **{stats.verified} ({Math.round((stats.verified / (stats.contacts || 1)) * 100)}%)** are verified, while **{stats.pending}** require administrative review.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link href="/contacts?status=PENDING">
            <Button size="sm" variant="default" className="font-semibold">
              Verify Contacts
            </Button>
          </Link>
          <Link href="/reports/missing-contacts">
            <Button size="sm" variant="outline" className="font-semibold">
              View Gaps
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Section 1: Territorial Boundaries & Jurisdictions */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 border-b border-border/30 pb-2">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/75">Jurisdiction Scope & Boundaries</h3>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {statCards.slice(0, 6).map((c, idx) => {
            const Icon = c.icon;
            return (
              <StatCard
                key={c.label}
                href={c.href}
                className="animate-fade-in"
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                <StatCardRow>
                  <div className="min-w-0">
                    <StatCardValue value={c.value} />
                    <StatCardLabel>{c.label}</StatCardLabel>
                    <StatCardSub>{c.sub}</StatCardSub>
                  </div>
                  <StatCardIcon icon={Icon} className={c.iconCls} bgClassName={c.bgCls} />
                </StatCardRow>
              </StatCard>
            );
          })}
        </div>
      </div>

      {/* KPI Section 2: Directory Seeding & Quality Control */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 border-b border-border/30 pb-2">
          <span className="h-1.5 w-1.5 rounded-full bg-teal" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/75">Directory Seeding & Verification Data Quality</h3>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {statCards.slice(6).map((c, idx) => {
            const Icon = c.icon;
            return (
              <StatCard
                key={c.label}
                href={c.href}
                className="animate-fade-in"
                style={{ animationDelay: `${(idx + 6) * 40}ms` }}
              >
                <StatCardRow>
                  <div className="min-w-0">
                    <StatCardValue value={c.value} />
                    <StatCardLabel>{c.label}</StatCardLabel>
                    <StatCardSub>{c.sub}</StatCardSub>
                  </div>
                  <StatCardIcon icon={Icon} className={c.iconCls} bgClassName={c.bgCls} />
                </StatCardRow>
              </StatCard>
            );
          })}
        </div>
      </div>

      {/* Split Workload Workspaces */}
      <div className="grid gap-6 lg:grid-cols-2 mt-8">
        {/* Left Column: Needs Verification */}
        <Card className="shadow-xs border-border/50">
          <CardHeader className="flex-row items-center justify-between border-b border-border/40 pb-3 pt-4">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-amber/10 p-2 shadow-3xs">
                <Clock className="h-4 w-4 text-amber-dark" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold text-foreground/90">Awaiting Verification Review</CardTitle>
                <CardDescription>Contacts flagged from directories that require audit confirmation</CardDescription>
              </div>
            </div>
            {stats.pending > 0 && (
              <Badge variant="warning" className="text-[10px] font-bold px-2 py-0.5 rounded-md">
                {stats.pending} pending
              </Badge>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {needs.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="Verification Queue Clear"
                  description="No contact records currently require verification audits."
                />
              </div>
            ) : (
              <ul className="divide-y divide-border/40 px-3.5 py-1.5">
                {needs.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 py-3 px-2.5 rounded-lg hover:bg-muted/30 transition-all duration-150 group"
                  >
                    <Link href={`/contacts/${c.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground/90 group-hover:text-primary transition-colors">
                        {c.full_name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground/80 mt-0.5">
                        {c.designation} {c.department ? `· ${c.department}` : ""}
                      </p>
                    </Link>
                    <div className="flex shrink-0 items-center gap-2">
                      {c.source === "engineers_seed.json" && <UnverifiedSeedTag />}
                      <VerificationBadge status={c.verification_status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
          <CardFooter className="justify-end bg-muted/5 py-3 border-t border-border/40">
            <Link
              href="/reports/pending-verification"
              className="flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/90 transition-colors"
            >
              Open Full Triage Queue <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardFooter>
        </Card>

        {/* Right Column: Recently Updated */}
        <Card className="shadow-xs border-border/50">
          <CardHeader className="flex-row items-center justify-between border-b border-border/40 pb-3 pt-4">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-teal/10 p-2 shadow-3xs">
                <TrendingUp className="h-4 w-4 text-teal" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold text-foreground/90">Recent System Activity</CardTitle>
                <CardDescription>Latest contact edits, directory uploads, and audits</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recent.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No Recent Edits"
                  description="Changes to local records will appear in this workspace audit log."
                />
              </div>
            ) : (
              <ul className="divide-y divide-border/40 px-3.5 py-1.5">
                {recent.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 py-3 px-2.5 rounded-lg hover:bg-muted/30 transition-all duration-150 group"
                  >
                    <Link href={`/contacts/${c.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground/90 group-hover:text-primary transition-colors">
                        {c.full_name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground/80 mt-0.5">
                        {c.designation} {c.department ? `· ${c.department}` : ""}
                      </p>
                    </Link>
                    <span className="shrink-0 rounded-full bg-muted/60 border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/90">
                      {c.confidence_score.toLowerCase()} score
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
          <CardFooter className="justify-end bg-muted/5 py-3 border-t border-border/40">
            <Link
              href="/reports/recent"
              className="flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/90 transition-colors"
            >
              View System Change Logs <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
