import { cn } from "@/lib/utils";

/**
 * Section-level header (icon + title + description + badge + actions) for grouping
 * content inside a page or Card — distinct from PageHeader, which is page-level.
 * Drop-in replacement for a hand-rolled CardHeader when a section needs this shape.
 */
export function SectionHeader({
  icon: Icon,
  title,
  description,
  badge,
  actions,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-border/50 bg-muted/20 px-5 py-4",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground/60" />}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-bold tracking-tight text-foreground/90">{title}</h3>
            {badge}
          </div>
          {description && (
            <p className="mt-0.5 truncate text-[11px] font-medium text-muted-foreground/85">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
