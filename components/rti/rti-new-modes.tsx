"use client";

import * as React from "react";
import { FilePlus2, FileStack } from "lucide-react";
import { cn } from "@/lib/utils";
import { RtiQuickCreateForm } from "./rti-quick-create-form";
import { RtiBulkImport } from "./rti-bulk-import";

const tabCls =
  "flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold transition-colors text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200";
const activeCls =
  "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100";

export function RtiNewModes() {
  const [mode, setMode] = React.useState<"single" | "bulk">("single");

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50/60 p-1 dark:border-slate-800 dark:bg-slate-900/50">
        <button
          type="button"
          onClick={() => setMode("single")}
          className={cn(tabCls, mode === "single" && activeCls)}
        >
          <FilePlus2 className="h-4 w-4" /> Single RTI
        </button>
        <button
          type="button"
          onClick={() => setMode("bulk")}
          className={cn(tabCls, mode === "bulk" && activeCls)}
        >
          <FileStack className="h-4 w-4" /> Office copy (multiple letters)
        </button>
      </div>

      {mode === "single" ? <RtiQuickCreateForm /> : <RtiBulkImport />}
    </div>
  );
}
