import { cn } from "@/lib/utils";
import { Inbox } from "lucide-react";

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  children,
  className,
  compact,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/5 text-center",
        compact ? "px-4 py-8" : "px-8 py-14",
        className,
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted/25 border border-border/50 shadow-3xs text-muted-foreground/60 transition-transform duration-350 hover:scale-[1.03]">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-bold text-foreground/90 leading-none">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-muted-foreground/80 font-medium">
          {description}
        </p>
      )}
      {children && <div className="mt-4.5">{children}</div>}
    </div>
  );
}
