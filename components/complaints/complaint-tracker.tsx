"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, Pencil } from "lucide-react";
import type { Complaint } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { COMPLAINT_STATUSES } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { useTranslation } from "@/lib/i18n/client";
import { translateEnum } from "@/lib/i18n/translate-enum";

export function ComplaintTracker({
  complaints,
  canEdit,
}: {
  complaints: Complaint[];
  canEdit: boolean;
}) {
  const { t, locale } = useTranslation("complaints");
  const [status, setStatus] = React.useState<string>("all");

  const filtered =
    status === "all" ? complaints : complaints.filter((c) => c.status === status);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button size="sm" variant={status === "all" ? "default" : "outline"} onClick={() => setStatus("all")}>
          {t("list.tracker.all")} ({complaints.length})
        </Button>
        {COMPLAINT_STATUSES.map((s) => {
          const n = complaints.filter((c) => c.status === s).length;
          return (
            <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>
              {translateEnum("status", s, locale)} ({n})
            </Button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={t("list.tracker.noComplaintsTitle")} description={t("list.tracker.noComplaintsDescription")} />
      ) : (
        <div className="space-y-3">
          {filtered.map((c, idx) => {
            const staggerClass = `stagger-${(idx % 4) + 1}`;
            return (
              <Card
                key={c.id}
                id={c.id}
                className={cn(
                  "transition-all duration-300 ease-in-out hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 hover:-translate-y-0.5 active:translate-y-0 animate-fade-in",
                  staggerClass
                )}
              >
                <CardContent className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium hover:text-primary transition-colors duration-150">
                        <Link href={`/complaints/${c.id}`}>{c.title}</Link>
                      </span>
                      {c.reminder_flag && (
                        <Badge variant="warning"><Bell className="mr-1 h-3 w-3" /> {t("list.tracker.reminderBadge")}</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {translateEnum("workflow", c.type, locale)}
                      {c.complaint_number ? ` · ${c.complaint_number}` : ""}
                      {c.rti_number ? ` · RTI ${c.rti_number}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.date_submitted ? t("list.tracker.submittedOn", { date: formatDate(c.date_submitted) }) : t("list.tracker.notSubmitted")}
                      {c.next_action_date ? ` · ${t("list.tracker.nextAction", { date: formatDate(c.next_action_date) })}` : ""}
                      {c.due_date ? ` · ${t("list.tracker.due", { date: formatDate(c.due_date) })}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="muted">{translateEnum("status", c.status, locale)}</Badge>
                    {canEdit && (
                      <Button asChild size="icon" variant="ghost" className="h-8 w-8">
                        <Link href={`/complaints/${c.id}/edit`} aria-label="Edit"><Pencil className="h-4 w-4" /></Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
