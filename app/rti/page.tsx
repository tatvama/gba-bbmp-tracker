import Link from "next/link";
import {
  FileText,
  FilePlus2,
  Send,
  Hourglass,
  MailCheck,
  Scale,
  Gavel,
  AlertOctagon,
  Siren,
  ClipboardCheck,
  FileWarning,
  CheckCircle2,
  Plus,
  ArrowRight,
  Bell,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { RtiStatusBadge } from "@/components/rti/rti-status-badge";
import { DeadlineBadge } from "@/components/rti/deadline-badge";
import {
  rtiDashboardStats,
  listRtis,
  listUpcomingRtiReminders,
} from "@/lib/queries";
import { getDeadlineRules } from "@/lib/settings";
import { getSessionUser, hasRole } from "@/lib/auth";
import { RTI_WRITE_ROLES } from "@/lib/constants";
import { formatNumber, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = { title: "RTI Dashboard" };

export default async function RtiDashboard() {
  const [stats, rtis, reminders, rules, user] = await Promise.all([
    rtiDashboardStats(),
    listRtis(),
    listUpcomingRtiReminders(6),
    getDeadlineRules(),
    getSessionUser(),
  ]);
  const canEdit = hasRole(user, RTI_WRITE_ROLES);
  const recent = rtis.slice(0, 6);

  const cards = [
    { label: "Total RTIs", value: stats.total, icon: FileText, href: "/rti/all", iconCls: "text-primary", bgCls: "bg-primary/8" },
    { label: "Drafts", value: stats.draft, icon: FilePlus2, href: "/rti/all", iconCls: "text-clay", bgCls: "bg-muted" },
    { label: "Filed", value: stats.filed, icon: Send, href: "/rti/all", iconCls: "text-teal", bgCls: "bg-teal/8" },
    { label: "Awaiting reply", value: stats.awaitingReply, icon: Hourglass, href: "/rti/all", iconCls: "text-amber-dark", bgCls: "bg-amber/8" },
    { label: "Reply received", value: stats.replyReceived, icon: MailCheck, href: "/rti/all", iconCls: "text-teal", bgCls: "bg-teal/8" },
    { label: "First appeals due", value: stats.firstAppealsDue, icon: Scale, href: "/rti/reports", iconCls: "text-amber-dark", bgCls: "bg-amber/8" },
    { label: "Second appeals due", value: stats.secondAppealsDue, icon: Gavel, href: "/rti/reports", iconCls: "text-amber-dark", bgCls: "bg-amber/8" },
    { label: "Overdue", value: stats.overdue, icon: AlertOctagon, href: "/rti/reports", iconCls: "text-destructive", bgCls: "bg-destructive/8" },
    { label: "Life/liberty", value: stats.urgentLifeLiberty, icon: Siren, href: "/rti/all", iconCls: "text-destructive", bgCls: "bg-destructive/8" },
    { label: "Needs review", value: stats.needsReview, icon: ClipboardCheck, href: "/rti/all", iconCls: "text-primary", bgCls: "bg-primary/8" },
    { label: "Incomplete reply", value: stats.incompleteReply, icon: FileWarning, href: "/rti/reports", iconCls: "text-amber-dark", bgCls: "bg-amber/8" },
    { label: "Closed", value: stats.closed, icon: CheckCircle2, href: "/rti/all", iconCls: "text-teal", bgCls: "bg-teal/8" },
  ];

  return (
    <div>
      <PageHeader
        title="RTI Dashboard"
        description="Track every Right to Information application across its lifecycle — drafting, filing, statutory deadlines, replies, and appeals."
      >
        {canEdit && (
          <Button asChild size="sm">
            <Link href="/rti/new"><Plus className="h-4 w-4" /> New RTI</Link>
          </Button>
        )}
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.label} href={c.href} className="group block">
              <div className="stat-card h-full rounded-xl border bg-card p-4 shadow-sm group-hover:border-primary/30">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-2xl font-bold tabular-nums text-foreground">{formatNumber(c.value)}</p>
                    <p className="mt-0.5 text-xs font-semibold text-foreground/80">{c.label}</p>
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

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader className="flex-row items-center justify-between pb-3 pt-4">
            <CardTitle className="text-sm font-semibold">Recently updated RTIs</CardTitle>
            <Link href="/rti/all" className="flex items-center gap-1 text-xs text-primary hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="pb-4 pt-0">
            {recent.length === 0 ? (
              <EmptyState title="No RTIs yet" description="Create your first RTI or run npm run db:seed-rti for samples." />
            ) : (
              <ul className="divide-y">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                    <Link href={`/rti/${r.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium hover:text-primary">{r.subject}</p>
                      <p className="truncate text-xs text-muted-foreground">{r.internal_ref ?? "—"}</p>
                    </Link>
                    <div className="flex shrink-0 items-center gap-2">
                      <RtiStatusBadge status={r.status} />
                      <DeadlineBadge rti={r} rules={rules} withLabel={false} />
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
              <div className="rounded-md bg-amber/10 p-1.5">
                <Bell className="h-3.5 w-3.5 text-amber-dark" />
              </div>
              <CardTitle className="text-sm font-semibold">Upcoming follow-ups</CardTitle>
            </div>
            <Link href="/rti/calendar" className="flex items-center gap-1 text-xs text-primary hover:underline">
              Calendar <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="pb-4 pt-0">
            {reminders.length === 0 ? (
              <EmptyState title="No reminders" description="Reminders linked to RTIs appear here, soonest first." />
            ) : (
              <ul className="divide-y">
                {reminders.map((rm) => (
                  <li key={rm.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{rm.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{rm.description ?? ""}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDate(rm.due_date)}</span>
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
