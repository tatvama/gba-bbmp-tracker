"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { ChevronDown, ChevronUp } from "lucide-react";

export function WardsHeader() {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <>
      {/* Desktop Header */}
      <div className="hidden md:block">
        <PageHeader
          title="Master ward tracking"
          description="All 225 notified BBMP wards with their lineage (old 198 → new 225 → derived GBA corporation), engineering sub-division, property count and verification status. The corporation column is derived from each ward's Assembly Constituency."
        />
      </div>
      {/* Mobile Header */}
      <div className="block md:hidden bg-slate-55 dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 mb-4 space-y-1.5">
        <h1 className="text-xl font-bold tracking-tight text-slate-850 dark:text-slate-105">
          Master ward tracking
        </h1>
        <div className="text-xs text-slate-550 dark:text-slate-400 leading-relaxed">
          {expanded ? (
            <p>
              All 225 notified BBMP wards with their lineage (old 198 → new 225 → derived GBA corporation), engineering sub-division, property count and verification status. The corporation column is derived from each ward&apos;s Assembly Constituency.
            </p>
          ) : (
            <p className="line-clamp-2">
              All 225 notified BBMP wards with their lineage (old 198 → new 225 → derived GBA corporation), engineering sub-division, property count and verification status...
            </p>
          )}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-blue-600 hover:text-blue-700 font-bold mt-1 inline-flex items-center gap-0.5 cursor-pointer text-[11px]"
          >
            {expanded ? "Show Less" : "Read More"}
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </>
  );
}
