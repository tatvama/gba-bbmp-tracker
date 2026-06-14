import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { DeadlineBadge } from "@/components/rti/deadline-badge";
import { RtiStatusBadge } from "@/components/rti/rti-status-badge";
import { activeDeadline } from "@/lib/rti-deadlines";
import { formatDate } from "@/lib/format";
import type { RtiWithRelations } from "@/lib/types";
import type { DeadlineRules } from "@/lib/constants";

/** Agenda view of the deadline that currently matters for each open RTI. */
export function RtiCalendar({
  rtis,
  rules,
}: {
  rtis: RtiWithRelations[];
  rules: DeadlineRules;
}) {
  const now = new Date();
  const items = rtis
    .map((r) => ({ rti: r, active: activeDeadline(r, now, rules) }))
    .filter((x) => x.active)
    .sort((a, b) => (a.active!.due < b.active!.due ? -1 : 1));

  if (items.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="No upcoming deadlines"
        description="RTIs with a computed reply or appeal deadline will appear here, soonest first."
      />
    );
  }

  // Group by due date.
  const groups = new Map<string, typeof items>();
  for (const it of items) {
    const key = it.active!.due;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }

  return (
    <div className="space-y-5">
      {Array.from(groups.entries()).map(([date, group]) => (
        <div key={date}>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            {formatDate(date)}
            <span className="text-xs font-normal text-muted-foreground">
              ({group.length})
            </span>
          </h3>
          <ul className="space-y-2">
            {group.map(({ rti }) => (
              <li
                key={rti.id}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <Link href={`/rti/${rti.id}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium hover:text-primary">
                    {rti.subject}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {rti.internal_ref ?? "—"}
                    {rti.ward ? ` · Ward ${rti.ward.new_no}` : ""}
                  </p>
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <RtiStatusBadge status={rti.status} />
                  <DeadlineBadge rti={rti} rules={rules} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
