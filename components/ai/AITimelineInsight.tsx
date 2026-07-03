import { AlertTriangle, FileWarning, GitCompareArrows, Handshake } from "lucide-react";
import type { RecommendationRow } from "@/lib/ai/advisor/types";

const styleFor = (i: number) =>
  ["text-rose-600 dark:text-rose-400", "text-amber-600 dark:text-amber-400"][i % 2];

const COMMITMENT_CHIP: Record<string, string> = {
  fulfilled: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  pending: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  overdue: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  unmet: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
};

/** Kannada labels for the commitment-status chips (the values stay English enums). */
const COMMITMENT_STATUS_KN: Record<string, string> = {
  fulfilled: "ಈಡೇರಿಸಲಾಗಿದೆ",
  pending: "ಬಾಕಿ",
  overdue: "ಅವಧಿ ಮೀರಿದೆ",
  unmet: "ಈಡೇರಿಸಿಲ್ಲ",
};

export function AITimelineInsight({ recommendation }: { recommendation: RecommendationRow | null }) {
  if (!recommendation) return null;
  const { timeline_summary, detected_risks, missing_information, contradictions, commitments } = recommendation;

  if (
    !timeline_summary &&
    !detected_risks.length &&
    !missing_information.length &&
    !contradictions.length &&
    !commitments.length
  )
    return null;

  return (
    <div className="space-y-2.5 rounded-md border bg-muted/30 p-3 text-xs">
      {timeline_summary && (
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">ಕಾಲಾನುಕ್ರಮ ಸಾರಾಂಶ</p>
          <p className="text-foreground/90">{timeline_summary}</p>
        </div>
      )}
      {contradictions.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            <GitCompareArrows className="h-3 w-3" /> ವಿರೋಧಾಭಾಸಗಳು
          </p>
          <ul className="space-y-1">
            {contradictions.map((c, i) => (
              <li key={i} className="text-rose-600 dark:text-rose-400">
                • {c.summary}
                {c.conflictsWith && <span className="text-muted-foreground"> — ವಿರುದ್ಧವಾಗಿದೆ: {c.conflictsWith}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {commitments.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            <Handshake className="h-3 w-3" /> ಇಲಾಖೆಯ ಬದ್ಧತೆಗಳು
          </p>
          <ul className="space-y-1">
            {commitments.map((m, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${COMMITMENT_CHIP[m.status] ?? COMMITMENT_CHIP.pending}`}>
                  {COMMITMENT_STATUS_KN[m.status] ?? m.status}
                </span>
                <span className="text-foreground/90">
                  {m.commitment}
                  {m.dueBy && <span className="text-muted-foreground"> (ಗಡುವು {m.dueBy})</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {detected_risks.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            <AlertTriangle className="h-3 w-3" /> ಪತ್ತೆಯಾದ ಅಪಾಯಗಳು
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
            <FileWarning className="h-3 w-3" /> ಕಾಣೆಯಾದ ಮಾಹಿತಿ
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
