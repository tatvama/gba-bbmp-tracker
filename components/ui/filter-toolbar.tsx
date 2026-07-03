import React from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * COMPONENT DOCUMENTATION: FilterToolbar
 * ─────────────────────────────────────────────────────────────────────────────
 * Purpose:
 *   A unified action and search toolbar representing the visual and functional
 *   entry point for workspaces listings and directories.
 *
 * Usage:
 *   ```tsx
 *   import { FilterToolbar } from "@/components/ui/filter-toolbar";
 *
 *   <FilterToolbar
 *     searchPlaceholder="Search files..."
 *     searchValue={q}
 *     onSearchChange={(val) => setQ(val)}
 *     actions={<Button>Export</Button>}
 *     advancedFilters={<Select>...</Select>}
 *     filterPills={[{ label: "Status: Active", onRemove: () => setStatus("all") }]}
 *     onClearAll={() => resetFilters()}
 *   />
 *   ```
 *
 * Props:
 *   - searchPlaceholder (string, optional): Input placeholder value.
 *   - searchValue (string): Value state for query input.
 *   - onSearchChange ((value: string) => void): Search input modifier callback.
 *   - actions (React.ReactNode, optional): Right-aligned view togglers or utilities.
 *   - advancedFilters (React.ReactNode, optional): Shaded collapsible secondary selector rows.
 *   - filterPills (Pill[], optional): Dynamic array of active filter badges.
 *   - onClearAll (() => void, optional): Reset filters callback action.
 *
 * Responsive Behavior:
 *   - Search box scales to full width on mobile screens, shifting actions below.
 *   - Grid gap scales cleanly based on standard spacing tokens.
 *
 * Accessibility:
 *   - Clear screen-reader focus indicator rings on input fields.
 *   - Interactive badges trigger via mouse click or Enter key activation.
 *
 * Do's:
 *   - Do keep search placeholder text concise.
 *   - Do group advanced options inside a collapsible container.
 *
 * Don'ts:
 *   - Don't build secondary search widgets on the same page.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface FilterPill {
  label: string;
  onRemove: () => void;
}

export function FilterToolbar({
  searchPlaceholder = "Search...",
  searchValue,
  onSearchChange,
  actions,
  advancedFilters,
  filterPills,
  onClearAll,
  className,
}: {
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  actions?: React.ReactNode;
  advancedFilters?: React.ReactNode;
  filterPills?: FilterPill[];
  onClearAll?: () => void;
  className?: string;
}) {
  const hasActivePills = filterPills && filterPills.length > 0;

  return (
    <div
      className={cn(
        "bg-card border border-border/50 rounded-xl shadow-2xs overflow-hidden transition-all duration-200",
        className
      )}
    >
      {/* Primary search & action row */}
      <div className="p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-border/10 bg-card">
        <div className="relative w-full lg:max-w-md">
          <Input
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 bg-muted/10 border-border/80 focus:bg-background h-9 text-sm"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      {/* Collapsible advanced filters row */}
      {advancedFilters && (
        <div className="bg-muted/5 border-b border-border/10 p-4 transition-all duration-200">
          {advancedFilters}
        </div>
      )}

      {/* Active filter pills indicator strip */}
      {hasActivePills && (
        <div className="px-4 py-2.5 bg-muted/10 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground/80 font-medium select-none">
            Active filters:
          </span>
          {filterPills.map((pill, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 bg-background border border-border/60 text-foreground px-2 py-0.5 rounded-md font-medium shadow-3xs"
            >
              {pill.label}
              <button
                type="button"
                onClick={pill.onRemove}
                className="text-muted-foreground/60 hover:text-destructive rounded-full hover:bg-muted p-0.5 transition-colors"
                aria-label={`Remove filter ${pill.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {onClearAll && (
            <Button
              variant="ghost"
              onClick={onClearAll}
              className="h-auto p-1 text-xs text-primary hover:text-primary/80 font-bold hover:bg-transparent"
            >
              Clear all
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
