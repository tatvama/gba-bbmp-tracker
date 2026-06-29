import * as React from "react";
import { History, ChevronDown, ChevronUp, Clock } from "lucide-react";
import type { HistoryLog } from "./types";

interface AckHistoryTimelineProps {
  history: HistoryLog[] | null | undefined;
}

export function AckHistoryTimeline({ history }: AckHistoryTimelineProps) {
  const [expanded, setExpanded] = React.useState(false);

  const logs = React.useMemo(() => history || [], [history]);
  const hasLogs = logs.length > 0;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setExpanded(!expanded);
    }
  };

  return (
    <div className="border border-slate-200/80 rounded-xl overflow-hidden dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        onKeyDown={handleKeyDown}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold font-sans text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:bg-slate-900/30 transition-colors"
      >
        <span className="flex items-center gap-2">
          <History className="h-4 w-4 text-slate-400" />
          <span>VERIFICATION HISTORY LOGS ({logs.length})</span>
        </span>
        {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="p-4 bg-slate-50/20 border-t border-slate-100 dark:border-slate-800/80 max-h-48 overflow-y-auto space-y-3 scrollbar-thin">
          {!hasLogs ? (
            <div className="flex flex-col items-center justify-center py-4 text-center text-slate-400 dark:text-slate-600">
              <Clock className="h-6 w-6 mb-1.5 text-slate-300 dark:text-slate-755" />
              <span className="text-xs">No verification events logged</span>
            </div>
          ) : (
            <div className="space-y-2.5">
              {logs.map((log, idx) => (
                <div key={idx} className="flex justify-between gap-4 text-xs font-mono text-slate-500 border-b border-slate-50 dark:border-slate-900 last:border-0 pb-2 last:pb-0">
                  <span className="text-slate-700 dark:text-slate-300 break-words min-w-0">
                    • {log.event} <span className="text-[10px] text-slate-400">({log.user})</span>
                  </span>
                  <span className="shrink-0 text-slate-400">{new Date(log.timestamp).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
