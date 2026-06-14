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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VerificationBadge, UnverifiedSeedTag } from "@/components/badges";
import { EmptyState } from "@/components/empty-state";
import {
  getDashboardStats,
  getRecentlyUpdated,
  getNeedsVerification,
} from "@/lib/queries";
import { formatNumber } from "@/lib/format";

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
    <div>
      <PageHeader
        title="Bengaluru Ward & Engineer Tracker"
        description="Trace any locality across the 198 → 225 → 369 ward restructures and reach the responsible engineering sub-division. Every record shows its source and verification status."
      />

      {noData && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber/40 bg-amber/5 p-4 text-sm">
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

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {statCards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.label} href={c.href} className="group block">
              <div className="stat-card h-full rounded-xl border bg-card p-4 shadow-sm group-hover:border-primary/30">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-2xl font-bold tabular-nums text-foreground">
                      {formatNumber(c.value)}
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-foreground/80">
                      {c.label}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{c.sub}</p>
                  </div>
                  <div className={`shrink-0 rounded-lg p-2 ${c.bgCls}`}>
                    <Icon className={`h-4 w-4 ${c.iconCls}`} />
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Two-column activity */}
      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader className="flex-row items-center justify-between pb-3 pt-4">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-amber/10 p-1.5">
                <Clock className="h-3.5 w-3.5 text-amber-dark" />
              </div>
              <CardTitle className="text-sm font-semibold">
                Needs verification
              </CardTitle>
              {stats.pending > 0 && (
                <Badge variant="warning" className="text-[10px]">
                  {stats.pending}
                </Badge>
              )}
            </div>
            <Link
              href="/reports/pending-verification"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="pb-4 pt-0">
            {needs.length === 0 ? (
              <EmptyState
                title="All clear"
                description="No contacts awaiting verification."
              />
            ) : (
              <ul className="divide-y">
                {needs.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <Link href={`/contacts/${c.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium hover:text-primary">
                        {c.full_name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.designation}
                      </p>
                    </Link>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {c.source === "engineers_seed.json" && <UnverifiedSeedTag />}
                      <VerificationBadge status={c.verification_status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex-row items-center justify-between pb-3 pt-4">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-teal/10 p-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-teal" />
              </div>
              <CardTitle className="text-sm font-semibold">
                Recently updated
              </CardTitle>
            </div>
            <Link
              href="/reports/recent"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="pb-4 pt-0">
            {recent.length === 0 ? (
              <EmptyState
                title="No recent changes"
                description="Edits to contacts and wards will appear here."
              />
            ) : (
              <ul className="divide-y">
                {recent.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <Link href={`/contacts/${c.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium hover:text-primary">
                        {c.full_name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.designation}
                      </p>
                    </Link>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                      {c.confidence_score.toLowerCase()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
