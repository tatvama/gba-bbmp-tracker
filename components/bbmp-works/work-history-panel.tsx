import { EmptyState } from "@/components/empty-state";
import { formatDateTime, orDash } from "@/lib/format";
import type { AuditLog } from "@/lib/types";

/** "Change history" for a bbmp_works record — same list shape as the
 *  "Verification history" section on app/wards/[newNo]/page.tsx. Kept as its
 *  own component (rather than folded into work-details-card.tsx, which is
 *  out of scope for this feature) so the two permalink pages can render it
 *  alongside the read-only card. */
export function WorkHistoryPanel({ logs }: { logs: AuditLog[] }) {
  return (
    <div>
      <h2 className="mb-3 font-serif text-xl font-semibold">Change history</h2>
      {logs.length === 0 ? (
        <EmptyState title="No recorded changes" description="Edits to this work record will be logged here." />
      ) : (
        <ul className="space-y-2 text-sm">
          {logs.map((a) => (
            <li key={a.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{a.field_name ?? "change"}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(a.changed_at)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {orDash(a.old_value)} → {orDash(a.new_value)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
