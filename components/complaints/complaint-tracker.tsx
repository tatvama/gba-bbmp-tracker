"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, Pencil } from "lucide-react";
import type { Complaint } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { COMPLAINT_STATUSES } from "@/lib/constants";
import { formatDate } from "@/lib/format";

export function ComplaintTracker({
  complaints,
  canEdit,
}: {
  complaints: Complaint[];
  canEdit: boolean;
}) {
  const [status, setStatus] = React.useState<string>("all");

  const filtered =
    status === "all" ? complaints : complaints.filter((c) => c.status === status);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button size="sm" variant={status === "all" ? "default" : "outline"} onClick={() => setStatus("all")}>
          All ({complaints.length})
        </Button>
        {COMPLAINT_STATUSES.map((s) => {
          const n = complaints.filter((c) => c.status === s).length;
          return (
            <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>
              {s.replace(/_/g, " ")} ({n})
            </Button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No complaints" description="Log a complaint or RTI to start tracking it." />
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <Card key={c.id} id={c.id}>
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.title}</span>
                    {c.reminder_flag && (
                      <Badge variant="warning"><Bell className="mr-1 h-3 w-3" /> reminder</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.type}
                    {c.complaint_number ? ` · ${c.complaint_number}` : ""}
                    {c.rti_number ? ` · RTI ${c.rti_number}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.date_submitted ? `Submitted ${formatDate(c.date_submitted)}` : "Not submitted"}
                    {c.next_action_date ? ` · Next action ${formatDate(c.next_action_date)}` : ""}
                    {c.due_date ? ` · Due ${formatDate(c.due_date)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="muted">{c.status.replace(/_/g, " ")}</Badge>
                  {canEdit && (
                    <Button asChild size="icon" variant="ghost" className="h-8 w-8">
                      <Link href={`/complaints/${c.id}/edit`} aria-label="Edit"><Pencil className="h-4 w-4" /></Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
