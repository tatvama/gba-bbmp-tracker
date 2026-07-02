import { AlertTriangle, FileWarning } from "lucide-react";
import type { RecommendationRow } from "@/lib/ai/advisor/types";

const styleFor = (i: number) =>
  ["text-rose-600 dark:text-rose-400", "text-amber-600 dark:text-amber-400"][i % 2];

export function AITimelineInsight({ recommendation }: { recommendation: RecommendationRow | null }) {
  if (!recommendation) return null;
  const { timeline_summary, detected_risks, missing_information } = recommendation;

  if (!timeline_summary && !detected_risks.length && !missing_information.length) return null;

  return (
    <div className="space-y-2.5 rounded-md border bg-muted/30 p-3 text-xs">
      {timeline_summary && (
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Timeline summary</p>
          <p className="text-foreground/90">{timeline_summary}</p>
        </div>
      )}
      {detected_risks.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            <AlertTriangle className="h-3 w-3" /> Detected risks
          </p>
          <ul className="space-y-1">
            {detected_risks.map((r, i) => (
              <li key={i} className={styleFor(i)}>• {r}</li>
            ))}
          </ul>
        </div>
      )}
      {missing_information.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            <FileWarning className="h-3 w-3" /> Missing information
          </p>
          <ul className="space-y-1 text-muted-foreground">
            {missing_information.map((m, i) => (
              <li key={i}>• {m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
