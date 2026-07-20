import { AlertTriangle, FileWarning, GitCompareArrows, Handshake } from "lucide-react";
import type { AdvisorLanguage, RecommendationRow } from "@/lib/ai/advisor/types";

const styleFor = (i: number) =>
  ["text-rose-600 dark:text-rose-400", "text-amber-600 dark:text-amber-400"][i % 2];

const COMMITMENT_CHIP: Record<string, string> = {
  fulfilled: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  pending: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  overdue: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  unmet: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
};

/** Commitment-status chip labels per language (the stored values stay English enums). */
const COMMITMENT_STATUS_LABEL: Record<AdvisorLanguage, Record<string, string>> = {
  kn: { fulfilled: "ಈಡೇರಿಸಲಾಗಿದೆ", pending: "ಬಾಕಿ", overdue: "ಅವಧಿ ಮೀರಿದೆ", unmet: "ಈಡೇರಿಸಿಲ್ಲ" },
  en: { fulfilled: "Fulfilled", pending: "Pending", overdue: "Overdue", unmet: "Unmet" },
};

export function AITimelineInsight({ recommendation, className = "", lang = "kn" }: { recommendation: RecommendationRow | null; className?: string; lang?: AdvisorLanguage }) {
  if (!recommendation) return null;
  const commitmentStatus = COMMITMENT_STATUS_LABEL[lang];
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
    <div className={`space-y-4 rounded-xl border border-slate-150 bg-slate-50/15 p-5 text-xs dark:border-slate-850 shadow-2xs ${className}`}>
      {timeline_summary && (
        <div className="space-y-1">
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-450">ಕಾಲಾನುಕ್ರಮ ಸಾರಾಂಶ (Timeline Summary)</p>
          <p className="text-slate-700 dark:text-slate-300 font-semibold leading-relaxed">{timeline_summary}</p>
        </div>
      )}
      {contradictions.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-850">
          <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-550">
            <GitCompareArrows className="h-4 w-4 text-rose-500" /> ವಿರೋಧಾಭಾಸಗಳು (Contradictions)
          </p>
          <ul className="space-y-1">
            {contradictions.map((c, i) => (
              <li key={i} className="text-rose-600 dark:text-rose-400 font-semibold leading-relaxed">
                • {c.summary}
                {c.conflictsWith && <span className="text-muted-foreground font-normal"> — {lang === "en" ? "conflicts with" : "ವಿರುದ್ಧವಾಗಿದೆ"}: {c.conflictsWith}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {commitments.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-850">
          <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-550">
            <Handshake className="h-4 w-4 text-primary" /> ಇಲಾಖೆಯ ಬದ್ಧತೆಗಳು (Department Commitments)
          </p>
          <ul className="space-y-1.5">
            {commitments.map((m, i) => (
              <li key={i} className="flex items-start gap-2 font-semibold leading-relaxed">
                <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${COMMITMENT_CHIP[m.status] ?? COMMITMENT_CHIP.pending}`}>
                  {commitmentStatus[m.status] ?? m.status}
                </span>
                <span className="text-slate-800 dark:text-slate-205">
                  {m.commitment}
                  {m.dueBy && <span className="text-muted-foreground font-normal"> ({lang === "en" ? "due" : "ಗಡುವು"} {m.dueBy})</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {detected_risks.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-850">
          <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-550">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> ಪತ್ತೆಯಾದ ಅಪಾಯಗಳು (Detected Risks)
          </p>
          <ul className="space-y-1">
            {detected_risks.map((r, i) => (
              <li key={i} className={`${styleFor(i)} font-semibold leading-relaxed`}>• {r}</li>
            ))}
          </ul>
        </div>
      )}
      {missing_information.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-850">
          <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-550">
            <FileWarning className="h-4 w-4 text-rose-500" /> ಕಾಣೆಯಾದ ಮಾಹಿತಿ (Missing Information)
          </p>
          <ul className="space-y-1 text-slate-550 dark:text-slate-400 font-semibold leading-relaxed">
            {missing_information.map((m, i) => (
              <li key={i}>• {m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
