import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { listComplaints } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import { getTranslations } from "@/lib/i18n/server";
import { translateEnum } from "@/lib/i18n/translate-enum";

export const dynamic = "force-dynamic";
export const metadata = { title: "Today's follow-ups" };

export default async function MobileTodayPage() {
  const today = new Date().toISOString().slice(0, 10);
  const all = await listComplaints();
  const due = all.filter((c) => c.next_follow_up_date && c.next_follow_up_date <= today);
  const { t, locale } = await getTranslations("complaints");

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title={t("form.todayFollowUpsTitle")} description={t("form.todayFollowUpsDesc")} />
      {due.length === 0 ? (
        <EmptyState title={t("form.allCaughtUpTitle")} description={t("form.noFollowUpsDueDesc")} />
      ) : (
        <ul className="space-y-2">
          {due.map((c) => {
            const overdue = c.next_follow_up_date! < today;
            return (
              <li key={c.id}>
                <Link href={`/complaints/${c.id}`} className="flex items-center justify-between gap-3 rounded-lg border p-4 hover:border-primary/40">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.internal_case_number ?? ""} · {t("form.dueOn", { date: formatDate(c.next_follow_up_date) })}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {overdue && <Badge variant="destructive">{t("form.overdueBadge")}</Badge>}
                    <Badge variant="muted">{translateEnum("status", c.status, locale)}</Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
