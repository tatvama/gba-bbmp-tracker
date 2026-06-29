import * as React from "react";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface OcrPreviewProps {
  ocrText: string | null | undefined;
  isLoading?: boolean;
  className?: string;
}

export function OcrPreview({ ocrText, isLoading = false, className }: OcrPreviewProps) {
  const [expanded, setExpanded] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const cleanText = React.useMemo(() => (ocrText || "").trim(), [ocrText]);
  const lines = React.useMemo(() => (cleanText ? cleanText.split("\n") : []), [cleanText]);
  const hasMultipleLines = lines.length > 3;

  const displayedText = React.useMemo(() => {
    if (!cleanText) return "";
    if (expanded || !hasMultipleLines) return cleanText;
    return lines.slice(0, 3).join("\n") + "\n...";
  }, [cleanText, expanded, lines, hasMultipleLines]);

  if (isLoading) {
    return (
      <div className="space-y-3 w-full">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block font-mono">
            Extracted OCR Text Snippet
          </span>
        </div>
        <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 dark:border-slate-800/80 dark:bg-slate-900/10 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    );
  }

  if (!cleanText) {
    return (
      <div className="space-y-3 w-full">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block font-mono">
            Extracted OCR Text Snippet
          </span>
        </div>
        <div className="border border-dashed border-slate-200 rounded-xl p-6 text-center text-slate-400 dark:border-slate-800 dark:text-slate-600 bg-slate-50/20">
          <FileText className="h-8 w-8 mx-auto mb-2 text-slate-300 dark:text-slate-700" />
          <span className="text-xs font-medium">No OCR text extracted yet</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3 w-full", className)}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block font-mono">
          Extracted OCR Text Snippet
        </span>
        {hasMultipleLines && (
          <Button
            ref={triggerRef}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            className="text-xs h-7 gap-1 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                <span>Show Less</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                <span>Show More</span>
              </>
            )}
          </Button>
        )}
      </div>

      <div className="border border-slate-100 rounded-xl bg-slate-50/50 p-4 dark:border-slate-800/80 dark:bg-slate-900/10 shadow-sm transition-all duration-300">
        <pre className="text-xs font-mono leading-relaxed text-slate-600 dark:text-slate-400 whitespace-pre-wrap break-words select-all scrollbar-thin max-h-[300px] overflow-y-auto">
          {displayedText}
        </pre>
      </div>
    </div>
  );
}
