import Link from "next/link";
import {
  FileText, FilePlus2, Clock, AlertOctagon, MailCheck, Wrench, MailX,
  CalendarClock, TrendingUp, ScanLine, FileWarning, ClipboardCheck, ArrowRight,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { complaintDashboardStats, listComplaints } from "@/lib/queries";
import { formatNumber, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Complaint dashboard" };

export default async function ComplaintDashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const [stats, complaints] = await Promise.all([complaintDashboardStats(), listComplaints()]);
  const recent = complaints.slice(0, 6);
  const dueToday = complaints.filter((c) => c.next_follow_up_date === today).slice(0, 8);

  const cards = [
    { label: "Total", value: stats.total, icon: FileText, cls: "text-primary", bg: "bg-primary/8" },
    { label: "Filed this month", value: stats.filedThisMonth, icon: FilePlus2, cls: "text-teal", bg: "bg-teal/8" },
    { label: "Pending", value: stats.pending, icon: Clock, cls: "text-amber-dark", bg: "bg-amber/8" },
    { label: "Overdue", value: stats.overdue, icon: AlertOctagon, cls: "text-destructive", bg: "bg-destructive/8" },
    { label: "Replies received", value: stats.repliesReceived, icon: MailCheck, cls: "text-teal", bg: "bg-teal/8" },
    { label: "Action taken", value: stats.actionTaken, icon: Wrench, cls: "text-teal", bg: "bg-teal/8" },
    { label: "No reply", value: stats.noReply, icon: MailX, cls: "text-destructive", bg: "bg-destructive/8" },
    { label: "Follow-ups today", value: stats.followUpsDueToday, icon: CalendarClock, cls: "text-amber-dark", bg: "bg-amber/8" },
    { label: "Escalations", value: stats.escalationsPending, icon: TrendingUp, cls: "text-amber-dark", bg: "bg-amber/8" },
    { label: "OCR pending", value: stats.ocrPending, icon: ScanLine, cls: "text-primary", bg: "bg-primary/8" },
    { label: "Low-confidence OCR", value: stats.lowConfidenceOcr, icon: FileWarning, cls: "text-amber-dark", bg: "bg-amber/8" },
    { label: "Needs review", value: stats.needsManualReview, icon: ClipboardCheck, cls: "text-primary", bg: "bg-primary/8" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Complaint dashboard" description="Live complaint, reply, action-taken, OCR and follow-up status across the platform." />
      
      {/* Grid of KPI cards. Supports single column on 320px screens up to lg:grid-cols-6 */}
      <div className="grid grid-cols-1 min-[340px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((c, idx) => {
          const Icon = c.icon;
          const staggerClass = `stagger-${(idx % 4) + 1}`;
          return (
            <Link
              key={c.label}
              href="/complaints"
              className={cn("group block animate-fade-in", staggerClass)}
            >
              <div className="stat-card h-full rounded-xl border bg-card p-4 shadow-2xs group-hover:border-primary/30 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-2xl font-bold tabular-nums leading-none tracking-tight">{formatNumber(c.value)}</p>
                    <p className="mt-2 text-xs font-semibold text-foreground/80 break-words leading-tight">{c.label}</p>
                  </div>
                  <div className={`shrink-0 rounded-lg p-2 ${c.bg}`}><Icon className={`h-4 w-4 ${c.cls}`} /></div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {/* Follow-ups Section */}
        <Card className="shadow-2xs rounded-xl border">
          <CardHeader className="flex flex-row items-center justify-between pb-3 pt-4 px-4">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-550 dark:text-slate-405">Follow-ups due today</CardTitle>
            <Link href="/complaints" className="flex items-center gap-1 text-xs font-bold text-primary hover:underline">
              All <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="pb-4 pt-0 px-4">
            {dueToday.length === 0 ? (
              <div className="py-6 text-center">
                <EmptyState title="Nothing due today" />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-850">
                {dueToday.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                    <Link href={`/complaints/${c.id}`} className="min-w-0 flex-1 group">
                      <p className="text-sm font-medium hover:text-primary break-words line-clamp-2 leading-snug">
                        {c.title}
                      </p>
                      <p className="truncate text-xs text-muted-foreground mt-1 font-mono">
                        {c.internal_case_number ?? "—"}
                      </p>
                    </Link>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="warning" className="text-[10px] font-bold py-0.5">{c.status}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Recently Updated Section */}
        <Card className="shadow-2xs rounded-xl border">
          <CardHeader className="flex flex-row items-center justify-between pb-3 pt-4 px-4">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-550 dark:text-slate-405">Recently updated</CardTitle>
            <Link href="/complaints" className="flex items-center gap-1 text-xs font-bold text-primary hover:underline">
              All <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="pb-4 pt-0 px-4">
            {recent.length === 0 ? (
              <div className="py-6 text-center">
                <EmptyState title="No complaints yet" />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-850">
                {recent.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                    <Link href={`/complaints/${c.id}`} className="min-w-0 flex-1 group">
                      <p className="text-sm font-medium hover:text-primary break-words line-clamp-2 leading-snug">
                        {c.title}
                      </p>
                      <p className="truncate text-xs text-muted-foreground mt-1 font-mono">
                        {c.internal_case_number ?? "—"} · {formatDate(c.updated_at)}
                      </p>
                    </Link>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="muted" className="text-[10px] font-bold py-0.5">{c.status}</Badge>
                    </div>
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
