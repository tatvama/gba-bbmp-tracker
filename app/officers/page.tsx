import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listOfficers } from "@/lib/queries";
import { ROLE_LEVELS } from "@/lib/constants";
import { orDash } from "@/lib/format";
import { ChevronRight, Users } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Officer Accountability" };

export default async function OfficersPage() {
  const officers = await listOfficers();

  // Group by role_level in the canonical order; collect the rest under "Other officers".
  const known = new Set<string>(ROLE_LEVELS as readonly string[]);
  const groups: { level: string; list: typeof officers }[] = [];
  for (const level of ROLE_LEVELS) {
    const list = officers.filter((o) => o.role_level === level);
    if (list.length) groups.push({ level, list });
  }
  const rest = officers.filter((o) => !o.role_level || !known.has(o.role_level));
  if (rest.length) groups.push({ level: "Unspecified level", list: rest });

  return (
    <div>
      <PageHeader
        title="Officer Accountability"
        description="Engineering and civic officers by role level, with their current posting and reporting line. Open an officer to see their accountability scorecard and full transfer history."
        badge={<Badge variant="muted">{officers.length} officers</Badge>}
      />

      {officers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No officers yet"
          description="Add contacts (engineers/officers) to build the accountability hierarchy."
        />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.level}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {g.level} <Badge variant="muted">{g.list.length}</Badge>
              </h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {g.list.map((o) => (
                  <Link key={o.id} href={`/officers/${o.id}`}>
                    <Card elevated className="flex items-start justify-between gap-2 px-4 py-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{o.full_name}</div>
                        <div className="truncate text-xs text-muted-foreground">{o.designation}</div>
                        <div className="mt-1 truncate text-xs text-foreground/70">
                          {orDash(
                            [o.corporation?.name, o.division?.name, o.eng_subdivision?.name]
                              .filter(Boolean)
                              .join(" / ") || null,
                          )}
                        </div>
                        {o.reporting_officer && (
                          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            Reports to: {o.reporting_officer.full_name}
                          </div>
                        )}
                      </div>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
