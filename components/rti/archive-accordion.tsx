import * as React from "react";
import { ChevronDown, ChevronUp, FileImage, Eye, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ArchiveItem } from "./types";

interface ArchiveAccordionProps {
  archive: ArchiveItem[] | null | undefined;
  onViewCopy: (path: string) => void;
  onDownloadCopy: (path: string) => void;
  isPending: boolean;
}

export function ArchiveAccordion({
  archive,
  onViewCopy,
  onDownloadCopy,
  isPending,
}: ArchiveAccordionProps) {
  const [activeIdx, setActiveIdx] = React.useState<number | null>(null);

  const items = React.useMemo(() => archive || [], [archive]);
  const hasItems = items.length > 0;

  const handleToggle = (idx: number) => {
    setActiveIdx(activeIdx === idx ? null : idx);
  };

  const handleKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleToggle(idx);
    }
  };

  const formatBytes = React.useCallback((bytes?: number) => {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const dm = 1;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  }, []);

  if (!hasItems) {
    return null;
  }

  return (
    <div className="border border-slate-200/80 rounded-xl overflow-hidden dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm">
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 dark:border-slate-800 dark:bg-slate-900/30">
        <h4 className="text-xs font-semibold font-sans text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <FileImage className="h-4 w-4 text-slate-400" />
          <span>SUPERSEDED / ARCHIVED COPIES ({items.length})</span>
        </h4>
      </div>

      <div className="p-3 bg-slate-50/20 space-y-2.5">
        {items.map((arch, idx) => {
          const isExpanded = activeIdx === idx;
          const meta = arch.ack_file_metadata;
          const archStatus = arch.ack_status || "Archived";
          const archDate = meta?.uploadedAt || arch.archivedAt;
          const archType = meta?.fileType || meta?.mimeType || "Unknown";

          return (
            <div
              key={idx}
              className="bg-white dark:bg-slate-900/40 rounded-xl border border-slate-150 dark:border-slate-800/85 overflow-hidden shadow-sm transition-all duration-200"
            >
              {/* Accordion Trigger Header */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleToggle(idx)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
                aria-expanded={isExpanded}
                className="flex items-center justify-between p-3.5 hover:bg-slate-50/50 dark:hover:bg-slate-900/40 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
              >
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                    Version #{idx + 1}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-750"
                  >
                    {archStatus}
                  </Badge>
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                )}
              </div>

              {/* Accordion Content Body */}
              {isExpanded && (
                <div className="p-3.5 pt-0 border-t border-slate-50 dark:border-slate-800/60 bg-slate-50/10 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4 text-xs font-sans pt-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">
                        Uploaded:
                      </span>
                      <span className="font-medium text-slate-600 dark:text-slate-300">
                        {archDate ? new Date(archDate).toLocaleDateString() : "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">
                        File Type:
                      </span>
                      <span className="font-medium text-slate-600 dark:text-slate-300 truncate max-w-[120px]">
                        {archType}
                      </span>
                    </div>
                    {meta?.fileSize && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">
                          Size:
                        </span>
                        <span className="font-medium text-slate-600 dark:text-slate-300">
                          {formatBytes(meta.fileSize)}
                        </span>
                      </div>
                    )}
                    {arch.ack_recommended_action && (
                      <div className="flex items-center gap-1.5 sm:col-span-2">
                        <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">
                          Recommendation:
                        </span>
                        <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                          {arch.ack_recommended_action}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Actions buttons */}
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-50 dark:border-slate-800/40">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      className="text-xs h-7.5 gap-1 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      onClick={() => onViewCopy(arch.ack_image_path)}
                    >
                      <Eye className="h-3.5 w-3.5 text-slate-400" />
                      <span>View</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      className="text-xs h-7.5 gap-1 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      onClick={() => onDownloadCopy(arch.ack_image_path)}
                    >
                      <FileDown className="h-3.5 w-3.5 text-slate-400" />
                      <span>Download</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
