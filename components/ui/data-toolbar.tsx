"use client";

import * as React from "react";
import { Search, X, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Reusable toolbar shell: search + filter slot + export + refresh, laid out consistently above a table. */
function DataToolbar({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  );
}

function DataToolbarSearch({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-[180px] flex-1 sm:max-w-xs", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-8 pr-8"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Pushes subsequent toolbar children to the right edge. */
function DataToolbarSpacer() {
  return <div className="flex-1" />;
}

function DataToolbarRefresh({
  onRefresh,
  loading,
}: {
  onRefresh: () => void;
  loading?: boolean;
}) {
  return (
    <Button variant="outline" size="icon-sm" onClick={onRefresh} disabled={loading} aria-label="Refresh">
      <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
    </Button>
  );
}

export { DataToolbar, DataToolbarSearch, DataToolbarSpacer, DataToolbarRefresh };
