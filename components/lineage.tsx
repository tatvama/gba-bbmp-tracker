import { ChevronRight } from "lucide-react";
import { CORP_TINT } from "@/lib/constants";
import { DerivedBadge } from "@/components/badges";
import { cn } from "@/lib/utils";

/** The "Old · 198 → New · 225 → GBA · 369" lineage strip for a ward. */
export function LineageStrip({
  oldWards,
  newNo,
  newName,
  corpCode,
  corpName,
}: {
  oldWards: string[];
  newNo: number;
  newName: string;
  corpCode?: string | null;
  corpName?: string | null;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
      <Node label="Old · BBMP 198" tint="#9A8C7A" muted={oldWards.length === 0}>
        {oldWards.length > 0 ? (
          <ul className="space-y-0.5">
            {oldWards.map((o) => (
              <li key={o} className="text-sm font-medium">
                {o}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-sm italic text-muted-foreground">not mapped in source</span>
        )}
      </Node>

      <Arrow />

      <Node label="New · BBMP 225" tint="#1B2A4A">
        <span className="text-sm font-semibold">
          #{newNo} · {newName}
        </span>
      </Node>

      <Arrow />

      <Node
        label="GBA · 369"
        tint={corpCode ? CORP_TINT[corpCode] ?? "#8A8478" : "#8A8478"}
        muted={!corpCode}
      >
        {corpCode ? (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold">{corpName ?? corpCode}</span>
            <DerivedBadge />
          </div>
        ) : (
          <span className="text-sm italic text-muted-foreground">not resolved</span>
        )}
      </Node>
    </div>
  );
}

function Node({
  label,
  tint,
  muted,
  children,
}: {
  label: string;
  tint: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex-1 rounded-lg border bg-card p-3",
        muted && "opacity-80",
      )}
      style={{ borderLeft: `4px solid ${tint}` }}
    >
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex items-center justify-center text-muted-foreground sm:px-1">
      <ChevronRight className="h-5 w-5 rotate-90 sm:rotate-0" />
    </div>
  );
}
