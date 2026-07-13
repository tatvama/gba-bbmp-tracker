import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { inrFiguresAndWords } from "@/lib/format-inr";
import type { BBMPWorkDetails } from "@/lib/bbmp-works/types";
import { WorkVerificationBadge } from "./work-verification-badge";
import { ExportResultsButton } from "./export-results-button";

/** Compact multi-result list — one row per work. Mirrors the ResultRow/
 *  ResultGroup visual language from app/search/page.tsx (Card wrapping a
 *  divide-y list of Link rows). */
export function WorkResultsList({ works }: { works: BBMPWorkDetails[] }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end no-print">
        <ExportResultsButton works={works} />
      </div>
      <Card className="shadow-sm">
        <CardContent className="divide-y p-0">
          {works.map((w) => {
            const href = w.jobNumber
              ? `/bbmp-works/job/${encodeURIComponent(w.jobNumber)}`
              : `/bbmp-works/${w.id}`;
            const headlineAmount = w.sanctionedAmount ?? w.tenderAmount;
            const amountLabel = headlineAmount != null ? inrFiguresAndWords(headlineAmount).figures : null;
            const title =
              [w.jobNumber ? `Job ${w.jobNumber}` : null, w.workName].filter(Boolean).join(" · ") ||
              "Untitled work";
            const sub = [w.wardNumber ? `Ward ${w.wardNumber}` : w.wardName, w.divisionName]
              .filter(Boolean)
              .join(" · ");

            return (
              <Link
                key={w.id}
                href={href}
                className="flex items-center justify-between gap-3 px-4 py-3 transition-colors duration-100 hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{title}</p>
                  {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {amountLabel && (
                    <span className="text-xs font-medium text-muted-foreground">{amountLabel}</span>
                  )}
                  <WorkVerificationBadge status={w.verificationStatus} />
                </div>
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
