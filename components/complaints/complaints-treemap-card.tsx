"use client";

import * as React from "react";
import { TreemapExplorer } from "@/components/explorer/treemap-explorer";
import type { GbaTreeCorp } from "@/lib/queries";
import type { OrgTreemapRow } from "@/components/complaints/org-treemap";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Map as MapIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/client";

interface StatusCounts {
  total: number;
  active: number;
  pending: number;
  overdue: number;
  closed: number;
}

function getStatusCounts(complaintsList: OrgTreemapRow[]): StatusCounts {
  let active = 0;
  let pending = 0;
  let overdue = 0;
  let closed = 0;

  for (const r of complaintsList) {
    if (r.status === "Resolved" || r.status === "Closed") {
      closed++;
    } else if (r.overdue) {
      overdue++;
    } else if (
      r.status === "Assigned To Engineer" ||
      r.status === "Work In Progress" ||
      r.status === "Site Visit Done" ||
      r.status === "Reply Received" ||
      r.status === "Action Taken Report Received" ||
      r.status === "Under Review" ||
      r.status === "Reopened" ||
      r.status === "Escalated" ||
      r.status === "Partially Resolved"
    ) {
      active++;
    } else {
      pending++;
    }
  }

  return {
    total: complaintsList.length,
    active,
    pending,
    overdue,
    closed,
  };
}

export function aggregateTreeComplaints(
  corps: GbaTreeCorp[],
  complaints: OrgTreemapRow[]
): GbaTreeCorp[] {
  const wardComplaintsMap = new Map<number, OrgTreemapRow[]>();
  for (const c of complaints) {
    if (c.wardNo !== null && c.wardNo !== undefined) {
      const list = wardComplaintsMap.get(c.wardNo) || [];
      list.push(c);
      wardComplaintsMap.set(c.wardNo, list);
    }
  }

  // Deep clone to avoid mutating static or fetched data
  return corps.map((corp) => {
    let corpTotal = 0;
    let corpActive = 0;
    let corpPending = 0;
    let corpOverdue = 0;
    let corpClosed = 0;

    const divisions = corp.divisions.map((div) => {
      let divTotal = 0;
      let divActive = 0;
      let divPending = 0;
      let divOverdue = 0;
      let divClosed = 0;

      const subdivisions = div.subdivisions.map((sub) => {
        let subTotal = 0;
        let subActive = 0;
        let subPending = 0;
        let subOverdue = 0;
        let subClosed = 0;

        const wards = sub.wards.map((ward) => {
          const wComplaints = wardComplaintsMap.get(ward.no) || [];
          const stats = getStatusCounts(wComplaints);

          subTotal += stats.total;
          subActive += stats.active;
          subPending += stats.pending;
          subOverdue += stats.overdue;
          subClosed += stats.closed;

          return {
            ...ward,
            complaintCount: stats.total,
            activeCount: stats.active,
            pendingCount: stats.pending,
            overdueCount: stats.overdue,
            closedCount: stats.closed,
          };
        });

        divTotal += subTotal;
        divActive += subActive;
        divPending += subPending;
        divOverdue += subOverdue;
        divClosed += subClosed;

        return {
          ...sub,
          wards,
          complaintCount: subTotal,
          activeCount: subActive,
          pendingCount: subPending,
          overdueCount: subOverdue,
          closedCount: subClosed,
        };
      });

      corpTotal += divTotal;
      corpActive += divActive;
      corpPending += divPending;
      corpOverdue += divOverdue;
      corpClosed += divClosed;

      return {
        ...div,
        subdivisions,
        complaintCount: divTotal,
        activeCount: divActive,
        pendingCount: divPending,
        overdueCount: divOverdue,
        closedCount: divClosed,
      };
    });

    return {
      ...corp,
      divisions,
      complaintCount: corpTotal,
      activeCount: corpActive,
      pendingCount: corpPending,
      overdueCount: corpOverdue,
      closedCount: corpClosed,
    };
  });
}

export function ComplaintsTreemapCard({
  gbaTree,
  bbmpTree,
  complaints,
}: {
  gbaTree: GbaTreeCorp[];
  bbmpTree: GbaTreeCorp[];
  complaints: OrgTreemapRow[];
}) {
  const { t } = useTranslation("complaints");
  const [treeType, setTreeType] = React.useState<"GBA" | "BBMP">("GBA");

  const rawTree = treeType === "GBA" ? gbaTree : bbmpTree;
  const aggregatedTree = React.useMemo(() => {
    return aggregateTreeComplaints(rawTree, complaints);
  }, [rawTree, complaints]);

  return (
    <Card className="shadow-2xs rounded-xl border overflow-hidden">
      <CardHeader className="flex flex-col md:flex-row md:items-center justify-between pb-3 pt-4 border-b border-slate-100 dark:border-slate-800 gap-4">
        <div className="space-y-1">
          <CardTitle className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <MapIcon className="h-4.5 w-4.5 text-primary" /> {t("list.treemapCard.title")}
          </CardTitle>
          <CardDescription>
            {t("list.treemapCard.description")}
          </CardDescription>
        </div>

        {/* Toggle Controls */}
        <div className="inline-flex bg-muted p-1 rounded-lg border border-slate-200 dark:border-slate-800 shadow-2xs self-start shrink-0">
          {(["GBA", "BBMP"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setTreeType(type)}
              className={cn(
                "px-3 py-1 rounded-md text-[11px] font-black cursor-pointer transition-all",
                treeType === type
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {type}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <TreemapExplorer key={treeType} corps={aggregatedTree} />
      </CardContent>
    </Card>
  );
}
