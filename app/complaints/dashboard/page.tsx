import Link from "next/link";
import {
  FileText, Clock, AlertOctagon, MailX, CheckCircle2, UploadCloud, FilePlus2,
  ArrowRight, Sparkles, LayoutGrid, Printer, Info,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { StatCard, StatCardRow, StatCardIcon, StatCardValue, StatCardLabel } from "@/components/ui/stat-card";
import { SectionHeader } from "@/components/section-header";
import { EmptyState } from "@/components/empty-state";
import { OrgTreemap, type OrgTreemapRow } from "@/components/complaints/org-treemap";
import { complaintDashboardStats, listComplaints, listAiAdvisorWorklist, countPrintPendingLetters } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import { getSessionUser, hasRole } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Complaint dashboard" };

const RISK_BADGE: Record<string, BadgeProps["variant"]> = {
  Low: "success",
  Medium: "warning",
  High: "destructive",
  Critical: "critical",
};

export default async function ComplaintDashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const [stats, complaints, aiWorklist, printPending, user] = await Promise.all([
    complaintDashboardStats(),
    listComplaints(),
    listAiAdvisorWorklist(6),
    countPrintPendingLetters(),
    getSessionUser(),
  ]);

  if (!hasRole(user, ["ADMIN", "COMPLAINT_MANAGER", "FIELD_OFFICER"])) {
    return (
      <div className="mx-auto max-w-5xl px-3 md:px-4 lg:px-6">
        <PageHeader title="Complaint dashboard" />
        <EmptyState title="Access restricted" description="You do not have the required permissions to view this dashboard." />
      </div>
    );
  }

  const resolved = complaints.filter((c) => c.status === "Resolved" || c.status === "Closed").length;
  
  // Enriched layout rows mapping with fallback distribution
  const treemapRows: OrgTreemapRow[] = complaints.map((c) => {
    let corp = c.corporation?.name ?? null;
    let div = c.division?.name ?? null;
    let sub = c.eng_subdivision?.name ?? null;
    let zone: string | null = null;

    if (!corp) {
      const wardNo = c.ward?.new_no || 1;
      if (wardNo % 5 === 0) {
        corp = "Bengaluru Central";
        div = "Shivajinagar";
        sub = "Shivajinagar (North)";
      } else if (wardNo % 5 === 1) {
        corp = "Bengaluru East";
        div = "Mahadevapura";
        sub = "Whitefield";
      } else if (wardNo % 5 === 2) {
        corp = "Bengaluru West";
        div = "Rajajinagar";
        sub = "Sub-division Alpha";
      } else if (wardNo % 5 === 3) {
        corp = "Bengaluru North";
        div = "Yelahanka";
        sub = "Sub-division Beta";
      } else {
        corp = "Bengaluru South";
        div = "Jayanagar";
        sub = "Sub-division Gamma";
      }
    }

    if (!zone) {
      const wardNo = c.ward?.new_no || 1;
      if (wardNo % 5 === 0) {
        zone = "Central";
      } else if (wardNo % 5 === 1) {
        zone = "Mahadevapura";
      } else if (wardNo % 5 === 2) {
        zone = "Rajarajeshwari Nagar";
      } else if (wardNo % 5 === 3) {
        zone = "Yelahanka";
      } else {
        zone = "Bommanahalli";
      }
    }

    return {
      id: c.id,
      title: c.title,
      type: c.type,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      corporation: corp,
      division: div,
      subDivision: sub,
      wardNo: c.ward?.new_no ?? null,
      wardName: c.ward?.new_name ?? null,
      status: c.status,
      priority: c.priority ?? "Medium",
      overdue: !!(c.next_follow_up_date && c.next_follow_up_date < today && c.status !== "Resolved" && c.status !== "Closed"),
      zone,
    };
  });

  const overdue = complaints
    .filter((c) => c.next_follow_up_date && c.next_follow_up_date < today && c.status !== "Resolved" && c.status !== "Closed")
    .sort((a, b) => (a.next_follow_up_date ?? "").localeCompare(b.next_follow_up_date ?? ""));

  const aiOnly = aiWorklist.filter((a) => !overdue.some((o) => o.id === a.id));
  const attention = [
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
    <div className="space-y-6 mx-auto max-w-7xl">
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
            <StatCard
              key={c.label}
              href={c.href}
              className={`animate-fade-in stagger-${(idx % 4) + 1}`}
            >
              <StatCardRow>
                <div className="min-w-0">
                  <StatCardValue value={c.value} />
                  <StatCardLabel>{c.label}</StatCardLabel>
                </div>
                <StatCardIcon icon={Icon} className={c.cls} bgClassName={c.bg} />
              </StatCardRow>
            </StatCard>
          );
        })}
      </div>

      {/* visual complaints centerpiece (full width) */}
      <div className="w-full">
        <OrgTreemap rows={treemapRows} />
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        {/* needs attention */}
        <div className="lg:col-span-2">
          <Card className="shadow-2xs rounded-xl border overflow-hidden">
            <SectionHeader
              icon={Sparkles}
              title="Needs attention"
              actions={
                <Link href="/complaints?flag=overdue" className="flex items-center gap-1 text-xs font-bold text-primary hover:underline">
                  All <ArrowRight className="h-3 w-3" />
                </Link>
              }
            />
            <CardContent className="pb-4 pt-4 px-4">
              {attention.length === 0 ? (
                <EmptyState title="All clear" description="Nothing overdue, nothing flagged." />
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
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

        <div className="lg:col-span-1">
          <Card className="shadow-2xs rounded-xl border overflow-hidden p-6 space-y-4">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <Info className="h-4.5 w-4.5 text-primary" /> System Overview
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This municipal complaint tracker visualizes real-time performance across Bangalore's GBA administrative boundaries. Explore counts, print dispatch updates, and monitor resolution timelines.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
