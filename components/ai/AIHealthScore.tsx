import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const RISK_VARIANT: Record<string, BadgeProps["variant"]> = {
  Low: "success",
  Medium: "warning",
  High: "destructive",
  Critical: "critical",
};

const SCORE_COLOR: Record<string, string> = {
  Low: "text-emerald-600 dark:text-emerald-400",
  Medium: "text-amber-600 dark:text-amber-400",
  High: "text-rose-600 dark:text-rose-400",
  Critical: "text-red-700 dark:text-red-500",
};

// The health badge only appears in the always-Kannada advisor card.
const RISK_LABEL_KN: Record<string, string> = {
  Low: "ಕಡಿಮೆ ಅಪಾಯ",
  Medium: "ಮಧ್ಯಮ ಅಪಾಯ",
  High: "ಹೆಚ್ಚು ಅಪಾಯ",
  Critical: "ಗಂಭೀರ ಅಪಾಯ",
};

export function AIHealthScore({
  score,
  riskLevel,
  compact,
}: {
  score: number;
  riskLevel: "Low" | "Medium" | "High" | "Critical";
  compact?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2", compact && "gap-1.5")}>
      <span className={cn("font-bold tabular-nums", compact ? "text-lg" : "text-2xl", SCORE_COLOR[riskLevel])}>
        {score}
      </span>
      {!compact && <span className="text-xs text-muted-foreground">/100</span>}
      <Badge variant={RISK_VARIANT[riskLevel] ?? "muted"} className={compact ? "text-[9px]" : undefined}>
        {RISK_LABEL_KN[riskLevel] ?? `${riskLevel} risk`}
      </Badge>
    </div>
  );
}
