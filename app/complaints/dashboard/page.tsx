import Link from "next/link";
import {
  FileText, Clock, AlertOctagon, MailX, CheckCircle2, UploadCloud, FilePlus2,
  ArrowRight, Sparkles, LayoutGrid, Printer,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { OrgTreemap, type OrgTreemapRow } from "@/components/complaints/org-treemap";
import { complaintDashboardStats, listComplaints, listAiAdvisorWorklist, countPrintPendingLetters } from "@/lib/queries";
import { formatNumber, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Complaint dashboard" };

const RISK_BADGE: Record<string, BadgeProps["variant"]> = {
  Low: "success",
  Medium: "warning",
  High: "destructive",
  Critical: "critical",
};

/**
 * Deliberately SIMPLE dashboard: five numbers, one treemap (where the
 * complaints are, by Division → Sub-division → Ward), one "needs attention"
 * list, three quick actions. Every deeper report lives on its own page.
 */
export default async function ComplaintDashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const [stats, complaints, aiWorklist, printPending] = await Promise.all([
    complaintDashboardStats(),
    listComplaints(),
    listAiAdvisorWorklist(6),
    countPrintPendingLetters(),
  ]);

  const resolved = complaints.filter((c) => c.status === "Resolved" || c.status === "Closed").length;
  const treemapRows: OrgTreemapRow[] = complaints.map((c) => ({
    division: c.division?.name ?? null,
    subDivision: c.eng_subdivision?.name ?? null,
    wardNo: c.ward?.new_no ?? null,
    wardName: c.ward?.new_name ?? null,
    status: c.status,
  }));

  const overdue = complaints
    .filter((c) => c.next_follow_up_date && c.next_follow_up_date < today && c.status !== "Resolved" && c.status !== "Closed")
    .sort((a, b) => (a.next_follow_up_date ?? "").localeCompare(b.next_follow_up_date ?? ""));

  // One merged "needs attention" list: overdue first, then what the AI flags.
  const aiOnly = aiWorklist.filter((a) => !overdue.some((o) => o.id === a.id));
  const attention: {
    id: string;
    title: string;
    caseNo: string | null;
    href: string;
    badge: { text: string; variant: BadgeProps["variant"] };
    sub: string;
  }[] = [
    ...overdue.slice(0, 5).map((c) => ({
      id: c.id,
      title: c.title,
      caseNo: c.internal_case_number ?? null,
      href: `/complaints/${c.id}`,
      badge: { text: "Overdue", variant: "destructive" as BadgeProps["variant"] },
      sub: c.next_follow_up_date ? `follow-up was due ${formatDate(c.next_follow_up_date)}` : c.status,
    })),
    ...aiOnly.slice(0, 4).map((a) => ({
      id: a.id,
      title: a.title,
      caseNo: a.internal_case_number,
      href: `/complaints/${a.id}?tab=ai`,
      badge: { text: `AI: ${a.risk_level}`, variant: RISK_BADGE[a.risk_level] ?? "muted" },
      sub: a.recommendation ?? a.status,
    })),
  ].slice(0, 8);

  const cards = [
    { label: "Total complaints", value: stats.total, icon: FileText, cls: "text-primary", bg: "bg-primary/8", href: "/complaints" },
    { label: "Print pending", value: printPending, icon: Printer, cls: "text-amber-dark", bg: "bg-amber/8", href: "/complaints/print-queue" },
    { label: "Active", value: stats.pending, icon: Clock, cls: "text-amber-dark", bg: "bg-amber/8", href: "/complaints?flag=open" },
    { label: "Awaiting reply", value: stats.noReply, icon: MailX, cls: "text-destructive", bg: "bg-destructive/8", href: "/complaints?flag=noreply" },
    { label: "Overdue", value: stats.overdue, icon: AlertOctagon, cls: "text-destructive", bg: "bg-destructive/8", href: "/complaints?flag=overdue" },
    { label: "Resolved / closed", value: resolved, icon: CheckCircle2, cls: "text-teal", bg: "bg-teal/8", href: "/complaints?status=Resolved" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Complaint dashboard" description="Where things stand — and what needs you next." />

      {/* quick actions */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/complaints/import"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
        >
          <UploadCloud className="h-4 w-4" /> Upload ZIP / letter
        </Link>
        <Link
          href="/complaints/new"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-card px-4 py-2.5 text-sm font-bold text-foreground shadow-2xs transition-all hover:border-primary/40 hover:-translate-y-0.5 dark:border-slate-700"
        >
          <FilePlus2 className="h-4 w-4" /> New complaint
        </Link>
        <Link
          href="/complaints"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-card px-4 py-2.5 text-sm font-bold text-foreground shadow-2xs transition-all hover:border-primary/40 hover:-translate-y-0.5 dark:border-slate-700"
        >
          <FileText className="h-4 w-4" /> All complaints
        </Link>
      </div>

      {printPending > 0 && (
        <Link
          href="/complaints/print-queue"
          className="flex items-center gap-2 rounded-lg border border-amber-300/50 bg-amber-50/60 px-4 py-3 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-400"
        >
          <Printer className="h-4 w-4 shrink-0" />
          {printPending} letter{printPending === 1 ? "" : "s"} waiting to be printed — the cycle starts there
          <ArrowRight className="ml-auto h-4 w-4 shrink-0" />
        </Link>
      )}

      {stats.overdue > 0 && (
        <Link
          href="/complaints?flag=overdue"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          <AlertOctagon className="h-4 w-4 shrink-0" />
          {stats.overdue} complaint{stats.overdue === 1 ? "" : "s"} {stats.overdue === 1 ? "is" : "are"} overdue for follow-up — chase now
          <ArrowRight className="ml-auto h-4 w-4 shrink-0" />
        </Link>
      )}

      {/* key numbers */}
      <div className="grid grid-cols-1 min-[340px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((c, idx) => {
          const Icon = c.icon;
          return (
            <Link key={c.label} href={c.href} className={`group block animate-fade-in stagger-${(idx % 4) + 1}`}>
              <div className="stat-card h-full rounded-xl border bg-card p-4 shadow-2xs group-hover:border-primary/30 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-2xl font-bold tabular-nums leading-none tracking-tight">{formatNumber(c.value)}</p>
                    <p className="mt-2 text-xs font-semibold text-foreground/80 break-words leading-tight">{c.label}</p>
                  </div>
                  <div className={`shrink-0 rounded-lg p-2 ${c.bg}`}>
                    <Icon className={`h-4 w-4 ${c.cls}`} />
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        {/* treemap: where the complaints are */}
        <Card className="shadow-2xs rounded-xl border lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
            <CardTitle className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-slate-550 dark:text-slate-405">
              <LayoutGrid className="h-3.5 w-3.5 text-primary" /> Complaints by area
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4 pt-0 px-4">
            <OrgTreemap rows={treemapRows} />
          </CardContent>
        </Card>

        {/* needs attention */}
        <Card className="shadow-2xs rounded-xl border">
          <CardHeader className="flex flex-row items-center justify-between pb-3 pt-4 px-4">
            <CardTitle className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-slate-550 dark:text-slate-405">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Needs attention
            </CardTitle>
            <Link href="/complaints?flag=overdue" className="flex items-center gap-1 text-xs font-bold text-primary hover:underline">
              All <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="pb-4 pt-0 px-4">
            {attention.length === 0 ? (
              <div className="py-6 text-center">
                <EmptyState title="All clear" description="Nothing overdue, nothing flagged." />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-850">
                {attention.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                    <Link href={a.href} className="min-w-0 flex-1 group">
                      <p className="text-sm font-medium hover:text-primary break-words line-clamp-2 leading-snug">{a.title}</p>
                      <p className="truncate text-xs text-muted-foreground mt-1">
                        <span className="font-mono">{a.caseNo ?? "—"}</span> · {a.sub}
                      </p>
                    </Link>
                    <Badge variant={a.badge.variant} className="shrink-0 text-[10px] font-bold py-0.5">
                      {a.badge.text}
                    </Badge>
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
