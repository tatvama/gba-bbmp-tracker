import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Scorecard {
  complaintsTotal: number;
  complaintsOpen: number;
  complaintsOverdue: number;
  rtisLinked: number;
  transfers: number;
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "danger" | "warn" }) {
  return (
    <Card className="px-4 py-3">
      <div
        className={cn(
          "text-2xl font-bold tabular-nums",
          tone === "danger" && value > 0 && "text-destructive",
          tone === "warn" && value > 0 && "text-amber-700",
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </Card>
  );
}

export function OfficerScorecard({ s }: { s: Scorecard }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Stat label="Complaints" value={s.complaintsTotal} />
      <Stat label="Open" value={s.complaintsOpen} tone="warn" />
      <Stat label="Overdue" value={s.complaintsOverdue} tone="danger" />
      <Stat label="RTIs linked" value={s.rtisLinked} />
      <Stat label="Transfers" value={s.transfers} />
    </div>
  );
}
