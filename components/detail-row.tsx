import { cn } from "@/lib/utils";

export function DetailRow({
  label,
  children,
  className,
  compact,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "border-b border-border/50 last:border-0",
        compact ? "py-1.5" : "py-2.5",
        className,
      )}
    >
      <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className={cn("mt-0.5 text-sm font-medium", compact && "mt-0")}>
        {children}
      </dd>
    </div>
  );
}

export function DetailGrid({
  children,
  cols = 2,
  className,
}: {
  children: React.ReactNode;
  cols?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6",
        cols === 1 && "grid-cols-1",
        cols === 2 && "grid-cols-1 sm:grid-cols-2",
        cols === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {children}
    </dl>
  );
}
