"use client";

import * as React from "react";
import { Sparkles, HelpCircle, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function AckHelpPanel() {
  const [open, setOpen] = React.useState(true);

  return (
    <Card className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-3xs overflow-hidden rounded-2xl select-none">
      <button
        type="button"
        className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 bg-slate-50/50 dark:border-slate-800/80 dark:bg-slate-950/20 text-left cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <span className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-350">
          <HelpCircle className="h-4 w-4 text-primary shrink-0" />
          How AI Detection Works
        </span>
        <div className="rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 p-1">
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </div>
      </button>

      {open && (
        <CardContent className="p-4 space-y-4 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          <div className="flex gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-850 dark:text-slate-200">1. Reads uploaded PDF</p>
              <p className="mt-0.5 text-muted-foreground">Scans the entire PDF document page by page using OCR.</p>
            </div>
          </div>
          <div className="flex gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-850 dark:text-slate-200">2. Detects individual pages</p>
              <p className="mt-0.5 text-muted-foreground">Splits multi-page documents into logical single receipts.</p>
            </div>
          </div>
          <div className="flex gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-850 dark:text-slate-200">3. Extracts metadata</p>
              <p className="mt-0.5 text-muted-foreground">Locates inward reference numbers, dates, and offices.</p>
            </div>
          </div>
          <div className="flex gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-850 dark:text-slate-200">4. Reads barcodes & QR codes</p>
              <p className="mt-0.5 text-muted-foreground">Decodes system metadata embedded directly on the sheet.</p>
            </div>
          </div>
          <div className="flex gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-850 dark:text-slate-200">5. Matches complaints</p>
              <p className="mt-0.5 text-muted-foreground">Proposes exact matches by comparing codes to database entries.</p>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-primary/5 p-3.5 border border-primary/10 text-primary">
            <div className="flex items-center gap-1.5 font-bold mb-1">
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              AI Autocomplete
            </div>
            High-confidence matches are automatically selected to save manual matching effort.
          </div>
        </CardContent>
      )}
    </Card>
  );
}
