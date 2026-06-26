"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export interface OcrPreviewProps {
  ocrText: string;
  className?: string;
}

/**
 * Displays raw OCR text extracted from the acknowledgement document.
 * Collapsed by default to 3 lines; expands to a scrollable full view.
 */
export function OcrPreview({ ocrText, className }: OcrPreviewProps) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div
      className={cn(
        "rounded-md border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/10",
        className,
      )}
    >
      <span className="mb-1.5 block text-[10px] font-mono font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
        <FileText className="h-3 w-3" aria-hidden="true" />
        Extracted OCR Text
      </span>

      <div
        id="ocr-preview-text"
        className={cn(
          "text-[11px] font-mono leading-relaxed text-slate-500 whitespace-pre-wrap select-all",
          expanded ? "max-h-40 overflow-y-auto" : "line-clamp-3",
        )}
      >
        {ocrText}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="ocr-preview-text"
        className="mt-1.5 flex items-center gap-1 text-[10px] font-mono text-indigo-600 hover:text-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
      >
        {expanded ? (
          <>
            <ChevronUp className="h-3 w-3" aria-hidden="true" />
            Show less
          </>
        ) : (
          <>
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
            Show full OCR text
          </>
        )}
      </button>
    </div>
  );
}
