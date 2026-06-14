import Link from "next/link";
import {
  FileText, FilePlus2, Clock, AlertOctagon, MailCheck, Wrench, MailX,
  CalendarClock, TrendingUp, ScanLine, FileWarning, ClipboardCheck, ArrowRight,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
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
    <div>
      <PageHeader title="Complaint dashboard" description="Live complaint, reply, action-taken, OCR and follow-up status across the platform." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.label} href="/complaints" className="group block">
              <div className="stat-card h-full rounded-xl border bg-card p-4 shadow-sm group-hover:border-primary/30">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-2xl font-bold tabular-nums">{formatNumber(c.value)}</p>
                    <p className="mt-0.5 text-xs font-semibold text-foreground/80">{c.label}</p>
                  </div>
                  <div className={`shrink-0 rounded-lg p-2 ${c.bg}`}><Icon className={`h-4 w-4 ${c.cls}`} /></div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader className="flex-row items-center justify-between pb-3 pt-4">
            <CardTitle className="text-sm font-semibold">Follow-ups due today</CardTitle>
            <Link href="/complaints" className="flex items-center gap-1 text-xs text-primary hover:underline">All <ArrowRight className="h-3 w-3" /></Link>
          </CardHeader>
          <CardContent className="pb-4 pt-0">
            {dueToday.length === 0 ? <EmptyState title="Nothing due today" /> : (
              <ul className="divide-y">{dueToday.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={`/complaints/${c.id}`} className="min-w-0 flex-1"><p className="truncate text-sm font-medium hover:text-primary">{c.title}</p><p className="truncate text-xs text-muted-foreground">{c.internal_case_number ?? ""}</p></Link>
                  <Badge variant="warning">{c.status}</Badge>
                </li>
              ))}</ul>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex-row items-center justify-between pb-3 pt-4">
            <CardTitle className="text-sm font-semibold">Recently updated</CardTitle>
            <Link href="/complaints" className="flex items-center gap-1 text-xs text-primary hover:underline">All <ArrowRight className="h-3 w-3" /></Link>
          </CardHeader>
          <CardContent className="pb-4 pt-0">
            {recent.length === 0 ? <EmptyState title="No complaints yet" /> : (
              <ul className="divide-y">{recent.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={`/complaints/${c.id}`} className="min-w-0 flex-1"><p className="truncate text-sm font-medium hover:text-primary">{c.title}</p><p className="truncate text-xs text-muted-foreground">{c.internal_case_number ?? ""} · {formatDate(c.updated_at)}</p></Link>
                  <Badge variant="muted">{c.status}</Badge>
                </li>
              ))}</ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
