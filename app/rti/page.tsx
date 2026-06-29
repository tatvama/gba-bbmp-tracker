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
import { cn } from "@/lib/utils";

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
    {
      label: "Total RTIs",
      value: stats.total,
      icon: FileText,
      href: "/rti/all",
      iconCls: "text-slate-600 dark:text-slate-400",
      bgCls: "bg-slate-100 dark:bg-slate-800",
      borderCls: "border-t-2 border-t-slate-400 dark:border-t-slate-500",
      helperText: "All-time tracking",
      type: "informational",
    },
    {
      label: "Drafts",
      value: stats.draft,
      icon: FilePlus2,
      href: "/rti/all",
      iconCls: "text-slate-600 dark:text-slate-400",
      bgCls: "bg-slate-100 dark:bg-slate-800",
      borderCls: "border-t-2 border-t-slate-350 dark:border-t-slate-500",
      helperText: "Not yet filed",
      type: "informational",
    },
    {
      label: "Filed",
      value: stats.filed,
      icon: Send,
      href: "/rti/all",
      iconCls: "text-teal-600 dark:text-teal-400",
      bgCls: "bg-teal-50 dark:bg-teal-950/30",
      borderCls: "border-t-2 border-t-teal-500",
      helperText: "Submitted to PIO",
      type: "operational",
    },
    {
      label: "Awaiting reply",
      value: stats.awaitingReply,
      icon: Hourglass,
      href: "/rti/all",
      iconCls: "text-blue-600 dark:text-blue-450",
      bgCls: "bg-blue-50 dark:bg-blue-950/30",
      borderCls: "border-t-2 border-t-blue-500",
      helperText: "Within timeline",
      type: "operational",
    },
    {
      label: "Reply received",
      value: stats.replyReceived,
      icon: MailCheck,
      href: "/rti/all",
      iconCls: "text-emerald-600 dark:text-emerald-455",
      bgCls: "bg-emerald-50 dark:bg-emerald-950/30",
      borderCls: "border-t-2 border-t-emerald-500",
      helperText: "Awaiting review",
      type: "operational",
    },
    {
      label: "First appeals due",
      value: stats.firstAppealsDue,
      icon: Scale,
      href: "/rti/reports",
      iconCls: "text-slate-600 dark:text-slate-400",
      bgCls: "bg-slate-100 dark:bg-slate-800",
      borderCls: "border-t-2 border-t-slate-400 dark:border-t-slate-500",
      helperText: "FAA level pending",
      type: "informational",
    },
    {
      label: "Second appeals due",
      value: stats.secondAppealsDue,
      icon: Gavel,
      href: "/rti/reports",
      iconCls: "text-slate-600 dark:text-slate-400",
      bgCls: "bg-slate-100 dark:bg-slate-800",
      borderCls: "border-t-2 border-t-slate-400 dark:border-t-slate-500",
      helperText: "Commission level",
      type: "informational",
    },
    {
      label: "Overdue",
      value: stats.overdue,
      icon: AlertOctagon,
      href: "/rti/reports",
      iconCls: "text-rose-600 dark:text-rose-450",
      bgCls: "bg-rose-50 dark:bg-rose-950/30",
      borderCls: "border-t-2 border-t-rose-500",
      helperText: "Requires action",
      type: "critical",
    },
    {
      label: "Life/liberty",
      value: stats.urgentLifeLiberty,
      icon: Siren,
      href: "/rti/all",
      iconCls: "text-rose-600 dark:text-rose-450",
      bgCls: "bg-rose-50 dark:bg-rose-950/30",
      borderCls: "border-t-2 border-t-rose-500",
      helperText: "48-hour deadline",
      type: "critical",
    },
    {
      label: "Needs review",
      value: stats.needsReview,
      icon: ClipboardCheck,
      href: "/rti/all",
      iconCls: "text-rose-600 dark:text-rose-450",
      bgCls: "bg-rose-50 dark:bg-rose-950/30",
      borderCls: "border-t-2 border-t-rose-500",
      helperText: "Officer action",
      type: "critical",
    },
    {
      label: "Incomplete reply",
      value: stats.incompleteReply,
      icon: FileWarning,
      href: "/rti/reports",
      iconCls: "text-slate-600 dark:text-slate-400",
      bgCls: "bg-slate-100 dark:bg-slate-800",
      borderCls: "border-t-2 border-t-slate-400 dark:border-t-slate-500",
      helperText: "Review for appeal",
      type: "informational",
    },
    {
      label: "Closed",
      value: stats.closed,
      icon: CheckCircle2,
      href: "/rti/all",
      iconCls: "text-slate-600 dark:text-slate-400",
      bgCls: "bg-slate-100 dark:bg-slate-800",
      borderCls: "border-t-2 border-t-slate-400 dark:border-t-slate-500",
      helperText: "Completed cases",
      type: "informational",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="RTI Dashboard"
        description="Track every Right to Information application across its lifecycle — drafting, filing, statutory deadlines, replies, and appeals."
      >
        {canEdit && (
          <Button asChild size="sm" className="rounded-lg">
            <Link href="/rti/new">
              <Plus className="h-4 w-4 mr-1" /> New RTI
            </Link>
          </Button>
        )}
      </PageHeader>

      {/* System Status / Meta Row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-505 dark:text-slate-450 border-b border-slate-200/60 dark:border-slate-800/60 pb-3 -mt-3">
        <span className="flex items-center gap-1.5 font-semibold">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          System Status: Active
        </span>
        <span className="text-slate-300 dark:text-slate-700">•</span>
        <span>Last Updated: Today</span>
        <span className="text-slate-300 dark:text-slate-700">•</span>
        <span>Active Cases: {stats.total - stats.closed}</span>
        <span className="text-slate-300 dark:text-slate-700">•</span>
        <span>Date: {formatDate(new Date().toISOString())}</span>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.label} href={c.href} className="group block">
              <div
                className={cn(
                  "h-full rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 transition-all duration-150 ease-out hover:border-primary/35 hover:shadow-xs relative overflow-hidden",
                  c.borderCls,
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-2.5xl font-extrabold tabular-nums text-slate-900 dark:text-slate-100 leading-none">
                      {formatNumber(c.value)}
                    </p>
                    <p className="mt-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 truncate">
                      {c.label}
                    </p>
                    <p className="mt-1 text-[10px] font-semibold text-slate-450 dark:text-slate-500">
                      {c.helperText}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "shrink-0 rounded-lg p-1.5 flex items-center justify-center",
                      c.bgCls,
                    )}
                  >
                    <Icon className={cn("h-4 w-4", c.iconCls)} />
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Recent Updates and Follow-ups */}
      <div className="grid gap-6 lg:grid-cols-2 mt-8">
        {/* Recently Updated */}
        <Card className="shadow-sm border border-slate-200 dark:border-slate-800/80 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
          <CardHeader className="flex-row items-center justify-between pb-3.5 pt-4.5 border-b border-slate-100 dark:border-slate-800/60">
            <div className="flex items-center gap-2">
              <FileText className="h-4.5 w-4.5 text-slate-500 dark:text-slate-400" />
              <CardTitle className="text-sm font-bold text-slate-850 dark:text-slate-200">
                Recently updated RTIs
              </CardTitle>
            </div>
            <Link
              href="/rti/all"
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="pb-4 pt-4">
            {recent.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <FileWarning className="h-10 w-10 text-slate-400 mb-2" />
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  No RTIs yet
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  Create your first RTI or run seed scripts for sample data.
                  </p>
              </div>
            ) : (
              <div className="space-y-3">
                {recent.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-4 p-3.5 rounded-lg border border-slate-150 bg-slate-50/30 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/25 dark:hover:bg-slate-800/40 transition-all duration-150 group"
                  >
                    <Link href={`/rti/${r.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-850 dark:text-slate-200 group-hover:text-primary transition-colors leading-normal">
                        {r.subject}
                      </p>
                      <p className="truncate text-[11px] font-mono text-slate-400 dark:text-slate-550 mt-1">
                        {r.internal_ref ?? "—"}
                      </p>
                    </Link>
                    <div className="flex shrink-0 items-center gap-2.5">
                      <RtiStatusBadge status={r.status} />
                      <DeadlineBadge rti={r} rules={rules} withLabel={false} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Follow-ups */}
        <Card className="shadow-sm border border-slate-200 dark:border-slate-800/80 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
          <CardHeader className="flex-row items-center justify-between pb-3.5 pt-4.5 border-b border-slate-100 dark:border-slate-800/60">
            <div className="flex items-center gap-2">
              <Bell className="h-4.5 w-4.5 text-slate-500 dark:text-slate-400" />
              <CardTitle className="text-sm font-bold text-slate-855 dark:text-slate-200">
                Upcoming follow-ups
              </CardTitle>
            </div>
            <Link
              href="/rti/calendar"
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              Calendar <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="pb-4 pt-4">
            {reminders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 mb-2 animate-pulse">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  ✓ No reminders
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  All follow-ups are completed or cleared.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {reminders.map((rm) => (
                  <div
                    key={rm.id}
                    className="flex items-center justify-between gap-3 p-3.5 rounded-lg border border-slate-150 bg-slate-50/30 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/25 dark:hover:bg-slate-800/40 transition-all duration-150 group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                        <p className="truncate text-sm font-semibold text-slate-805 dark:text-slate-200">
                          {rm.title}
                        </p>
                      </div>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-450 mt-1 pl-3.5">
                        {rm.description ?? ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-semibold text-slate-450 dark:text-slate-500">
                        {formatDate(rm.due_date)}
                      </span>
                      {rm.entity_id && (
                        <Link href={`/rti/${rm.entity_id}`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-foreground dark:text-slate-450 dark:hover:text-slate-200"
                          >
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
