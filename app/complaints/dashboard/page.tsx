import Link from "next/link";
import { Clock } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { getGbaTree, getBbmpTree, listComplaints, countPrintPendingLetters, listRepliesDueSoon } from "@/lib/queries";
import { OrgTreemap } from "@/components/complaints/org-treemap";
import { getSessionUser, hasRole } from "@/lib/auth";
import { formatDate } from "@/lib/format";

const STAGE_LABEL: Record<string, string> = {
  awaiting_reply: "awaiting reply",
  reminder_sent: "awaiting reply to reminder",
  legal_notice_sent: "awaiting reply to legal notice",
};

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Complaint dashboard",
};

export default async function ComplaintDashboard() {
  const user = await getSessionUser();
  if (!hasRole(user, ["ADMIN", "COMPLAINT_MANAGER", "FIELD_OFFICER"])) {
    return (
      <div className="mx-auto max-w-5xl px-3 md:px-4 lg:px-6">
        <EmptyState title="Access restricted" description="You do not have the required permissions to view this dashboard." />
      </div>
    );
  }

  const [gbaCorps, bbmpCorps, complaints, printPending, dueSoon] = await Promise.all([
    getGbaTree(),
    getBbmpTree(),
    listComplaints(),
    countPrintPendingLetters(),
    listRepliesDueSoon(),
  ]);

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-8 bg-[#F8FAFC] dark:bg-slate-950 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">Complaint Dashboard</h1>
        <p className="text-sm text-slate-500 dark:text-slate-450 mt-1.5 font-semibold">
          Premium enterprise analytics visualizer. Toggle GBA/BBMP layers to trace complaints across corporations, divisions, sub-divisions, wards, and assigned field officers.
        </p>
      </div>

      {dueSoon.length > 0 && (
        <div className="mb-6 flex flex-wrap items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50/40 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
          <Clock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-medium text-amber-700 dark:text-amber-400">
              {dueSoon.length} complaint{dueSoon.length === 1 ? "" : "s"} due to reply within 5 days — coming up:
            </p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {dueSoon.map((r) => (
                <li key={r.complaintId}>
                  <Link href={`/complaints/${r.complaintId}`} className="font-mono text-amber-800 dark:text-amber-300 underline">
                    {r.caseNumber ?? r.complaintId.slice(0, 8)}
                  </Link>
                  <span className="text-amber-700 dark:text-amber-400">
                    {" "}— {STAGE_LABEL[r.escalationStage] ?? r.escalationStage}, due {formatDate(r.deadline)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {gbaCorps.length === 0 ? (
        <EmptyState
          title="No GBA data loaded"
          description="Run npm run db:seed-gba to load the 369-ward breakdown, then refresh."
        />
      ) : (
        <OrgTreemap
          gbaCorps={gbaCorps}
          bbmpCorps={bbmpCorps}
          complaints={complaints}
          printPending={printPending}
          isComplaintsDashboard={true}
        />
      )}
    </div>
  );
}
