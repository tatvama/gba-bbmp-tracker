import Link from "next/link";
import { Clock } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { getGbaTree, getBbmpTree, listComplaints, countPrintPendingLetters, listRepliesDueSoon } from "@/lib/queries";
import { OrgTreemap } from "@/components/complaints/org-treemap";
import { getSessionUser, hasRole } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { getTranslations } from "@/lib/i18n/server";
import { translateEnum } from "@/lib/i18n/translate-enum";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Complaint dashboard",
};

export default async function ComplaintDashboard() {
  const { t, locale } = await getTranslations("complaints");
  const user = await getSessionUser();
  if (!hasRole(user, ["ADMIN", "COMPLAINT_MANAGER", "FIELD_OFFICER"])) {
    return (
      <div className="mx-auto max-w-5xl px-3 md:px-4 lg:px-6">
        <EmptyState title={t("list.dashboard.accessRestrictedTitle")} description={t("list.dashboard.accessRestrictedDescription")} />
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
        <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">{t("page.dashboardTitle")}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-450 mt-1.5 font-semibold">
          {t("list.dashboard.description")}
        </p>
      </div>

      {dueSoon.length > 0 && (
        <div className="mb-6 flex flex-wrap items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50/40 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
          <Clock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-medium text-amber-700 dark:text-amber-400">
              {t("list.dashboard.dueSoonBanner", { count: dueSoon.length, plural: dueSoon.length === 1 ? "" : "s" })}
            </p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {dueSoon.map((r) => (
                <li key={r.complaintId}>
                  <Link href={`/complaints/${r.complaintId}`} className="font-mono text-amber-800 dark:text-amber-300 underline">
                    {r.caseNumber ?? r.complaintId.slice(0, 8)}
                  </Link>
                  <span className="text-amber-700 dark:text-amber-400">
                    {" "}— {translateEnum("status", r.escalationStage, locale)}, due {formatDate(r.deadline)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {gbaCorps.length === 0 ? (
        <EmptyState
          title={t("list.dashboard.noGbaDataTitle")}
          description={t("list.dashboard.noGbaDataDescription")}
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
