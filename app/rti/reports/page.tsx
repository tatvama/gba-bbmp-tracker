import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportTable } from "@/components/reports/report-table";
import {
  listRtis,
  listAllFirstAppeals,
  listAllSecondAppeals,
} from "@/lib/queries";
import { getDeadlineRules } from "@/lib/settings";
import { activeDeadline, daysBetween } from "@/lib/rti-deadlines";
import { formatDate } from "@/lib/format";
import type { RtiWithRelations } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "RTI reports" };

const RTI_COLUMNS = [
  { key: "ref", label: "Ref" },
  { key: "subject", label: "Subject" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "due", label: "Due" },
  { key: "bucket", label: "State" },
];

export default async function RtiReportsPage() {
  const [rtis, firstAppeals, secondAppeals, rules] = await Promise.all([
    listRtis(),
    listAllFirstAppeals(),
    listAllSecondAppeals(),
    getDeadlineRules(),
  ]);
  const now = new Date();
  const byId = new Map(rtis.map((r) => [r.id, r]));

  function row(r: RtiWithRelations) {
    const a = activeDeadline(r, now, rules);
    return {
      ref: r.internal_ref ?? "",
      subject: r.subject,
      status: r.status,
      priority: r.priority,
      due: a ? formatDate(a.due) : "—",
      bucket: a ? a.label : "—",
    };
  }

  const overdue = rtis
    .filter((r) => {
      const a = activeDeadline(r, now, rules);
      return a && (a.bucket === "overdue" || a.bucket === "critical-overdue");
    })
    .map(row);

  const dueIn7 = rtis
    .filter((r) => {
      const a = activeDeadline(r, now, rules);
      if (!a) return false;
      const d = daysBetween(now, a.due);
      return d >= 0 && d <= 7;
    })
    .map(row);

  const noReply = rtis
    .filter(
      (r) =>
        !r.reply_date &&
        ["Filed", "Awaiting Reply", "No Reply"].includes(r.status) &&
        r.normal_due &&
        daysBetween(now, r.normal_due) < 0,
    )
    .map(row);

  const incompleteReply = rtis
    .filter(
      (r) =>
        r.status === "Partial Reply" ||
        r.satisfaction_status === "Partially Satisfied" ||
        r.satisfaction_status === "Incomplete Information",
    )
    .map(row);

  const firstAppealsPending = firstAppeals
    .filter((fa) => !fa.faa_order_date)
    .map((fa) => {
      const r = byId.get(fa.rti_id);
      return {
        ref: r?.internal_ref ?? "",
        subject: r?.subject ?? "(unknown RTI)",
        status: fa.status,
        grounds: fa.grounds.join(", "),
        filed: fa.date_filed ? formatDate(fa.date_filed) : "Draft",
        order_due: fa.faa_order_due ? formatDate(fa.faa_order_due) : "—",
      };
    });

  const secondAppealsPending = secondAppeals
    .filter((sa) => !sa.order_date)
    .map((sa) => {
      const r = byId.get(sa.rti_id);
      return {
        ref: r?.internal_ref ?? "",
        subject: r?.subject ?? "(unknown RTI)",
        status: sa.status,
        commission: sa.commission_name ?? "",
        diary: sa.diary_number ?? "",
        hearing: sa.hearing_date ? formatDate(sa.hearing_date) : "—",
      };
    });

  return (
    <div>
      <PageHeader
        title="RTI reports"
        description="Statutory compliance views. Each table exports to CSV / XLSX."
      />
      <div className="space-y-6">
        <Section title={`Overdue (${overdue.length})`}>
          <ReportTable columns={RTI_COLUMNS} rows={overdue} fileBase="rti-overdue" />
        </Section>
        <Section title={`Due within 7 days (${dueIn7.length})`}>
          <ReportTable columns={RTI_COLUMNS} rows={dueIn7} fileBase="rti-due-7-days" />
        </Section>
        <Section title={`No reply past the response window (${noReply.length})`}>
          <ReportTable columns={RTI_COLUMNS} rows={noReply} fileBase="rti-no-reply" />
        </Section>
        <Section title={`Incomplete / partial reply (${incompleteReply.length})`}>
          <ReportTable columns={RTI_COLUMNS} rows={incompleteReply} fileBase="rti-incomplete-reply" />
        </Section>
        <Section title={`First appeals pending FAA order (${firstAppealsPending.length})`}>
          <ReportTable
            columns={[
              { key: "ref", label: "RTI Ref" },
              { key: "subject", label: "Subject" },
              { key: "status", label: "Status" },
              { key: "grounds", label: "Grounds" },
              { key: "filed", label: "Filed" },
              { key: "order_due", label: "Order due" },
            ]}
            rows={firstAppealsPending}
            fileBase="rti-first-appeals-pending"
          />
        </Section>
        <Section title={`Second appeals pending order (${secondAppealsPending.length})`}>
          <ReportTable
            columns={[
              { key: "ref", label: "RTI Ref" },
              { key: "subject", label: "Subject" },
              { key: "status", label: "Status" },
              { key: "commission", label: "Commission" },
              { key: "diary", label: "Diary no." },
              { key: "hearing", label: "Hearing" },
            ]}
            rows={secondAppealsPending}
            fileBase="rti-second-appeals-pending"
          />
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
