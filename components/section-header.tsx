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
        "flex items-center justify-between gap-3 border-b bg-muted/40 px-5 py-3.5",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold tracking-tight text-foreground">{title}</h3>
            {badge}
          </div>
          {description && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
