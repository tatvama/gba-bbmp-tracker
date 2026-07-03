import React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * COMPONENT DOCUMENTATION: PageHeader
 * ─────────────────────────────────────────────────────────────────────────────
 * Purpose:
 *   Serves as the standard structural header block at the top of every page.
 *   Hosts breadcrumbs navigation path, title headings, semantic badge tags,
 *   and primary action buttons.
 *
 * Usage:
 *   ```tsx
 *   import { PageHeader } from "@/components/page-header";
 *
 *   <PageHeader
 *     title="Wards Explorer"
 *     description="Review civic boundaries and active officers."
 *     breadcrumbs={[{ label: "Wards", href: "/wards" }, { label: "Overview" }]}
 *   >
 *     <Button>Create Ward</Button>
 *   </PageHeader>
 *   ```
 *
 * Props:
 *   - title (string): Primary heading label.
 *   - description (string, optional): Explanatory description.
 *   - badge (React.ReactNode, optional): Inline badge tag (e.g. status status counts).
 *   - breadcrumbs (BreadcrumbItem[], optional): Breadcrumb hierarchy steps.
 *   - children (React.ReactNode, optional): Layout actions container.
 *   - className (string, optional): Style override classes.
 *
 * Responsive Behavior:
 *   - Small viewports: Title elements stack vertically above actions with compact paddings.
 *   - Large viewports: Align title elements left and action buttons right in a cozy layout row.
 *
 * Accessibility:
 *   - Uses semantic <nav aria-label="Breadcrumb"> container.
 *   - Text contrast meets WCAG AA standards.
 *
 * Do's:
 *   - Do keep breadcrumbs short and truncated when needed.
 *   - Do specify a single primary button within children actions.
 *
 * Don'ts:
 *   - Don't hardcode hex colors or custom inline paddings.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function PageHeader({
  title,
  description,
  badge,
  breadcrumbs,
  children,
  className,
}: {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-border/40 pb-5 animate-page-slide",
        className
      )}
    >
      <div className="min-w-0 space-y-1.5">
        {/* Breadcrumb nav */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground/80 font-medium">
            {breadcrumbs.map((item, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <React.Fragment key={index}>
                  {index > 0 && (
                    <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                  )}
                  {item.href && !isLast ? (
                    <Link
                      href={item.href}
                      className="hover:text-foreground transition-colors truncate max-w-[200px]"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span className={cn("truncate max-w-[200px]", isLast && "text-foreground font-semibold")}>
                      {item.label}
                    </span>
                  )}
                </React.Fragment>
              );
            })}
          </nav>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl leading-none">
            {title}
          </h1>
          {badge && <span className="shrink-0 translate-y-px">{badge}</span>}
        </div>
        {description && (
          <p className="max-w-3xl text-xs sm:text-sm leading-relaxed text-muted-foreground/90 font-medium">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 pt-1 sm:pt-0">
          {children}
        </div>
      )}
    </div>
  );
}
