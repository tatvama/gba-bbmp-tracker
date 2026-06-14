import { ArrowRight, Calendar } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { formatDate } from "@/lib/format";
import type { OfficerTransfer } from "@/lib/types";

function posting(corp?: string | null, div?: string | null, sub?: string | null, ward?: string | null) {
  const parts = [corp, div, sub, ward].filter(Boolean);
  return parts.length ? parts.join(" / ") : "—";
}

export function TransferTimeline({ transfers }: { transfers: OfficerTransfer[] }) {
  if (!transfers.length) {
    return <EmptyState compact title="No transfer history" description="No postings recorded for this officer yet." />;
  }
  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {transfers.map((t) => (
        <li key={t.id} className="relative">
          <span className="absolute -left-[1.4rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-primary bg-background" />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-muted-foreground">
              {posting(t.prev_corporation, t.prev_division, t.prev_subdivision, t.prev_ward)}
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-semibold">
              {posting(t.new_corporation, t.new_division, t.new_subdivision, t.new_ward)}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {t.effective_date && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Effective {formatDate(t.effective_date)}
              </span>
            )}
            {t.transfer_order_no && <span>Order: {t.transfer_order_no}</span>}
            {t.transfer_order_date && <span>Dated {formatDate(t.transfer_order_date)}</span>}
          </div>
          {t.notes && <p className="mt-1 text-xs text-foreground/70">{t.notes}</p>}
        </li>
      ))}
    </ol>
  );
}
