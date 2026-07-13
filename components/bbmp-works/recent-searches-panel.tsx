import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime } from "@/lib/format";
import type { SearchHistoryRow } from "@/lib/bbmp-works/queries";

/** One-line summary of the non-empty query_params entries, e.g.
 *  "jobNumber: 225-25-001234, wardName: Domlur". */
function summarizeParams(params: Record<string, unknown>): string {
  const parts = Object.entries(params ?? {})
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .map(([k, v]) => `${k}: ${v}`);
  return parts.length > 0 ? parts.join(", ") : "(no filters)";
}

/** Admin "recent searches" list — renders whatever rows the caller passes,
 *  no pagination of its own. */
export function RecentSearchesPanel({ searches }: { searches: SearchHistoryRow[] }) {
  if (searches.length === 0) {
    return (
      <EmptyState
        title="No searches logged yet"
        description="BBMP work searches will appear here as they happen."
      />
    );
  }

  return (
    <div className="space-y-2">
      {searches.map((s) => {
        const summary = summarizeParams(s.query_params);
        return (
          <Card key={s.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <span className="min-w-0 flex-1 truncate" title={summary}>{summary}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {s.result_count} result{s.result_count === 1 ? "" : "s"} · {formatDateTime(s.searched_at)}
              </span>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
