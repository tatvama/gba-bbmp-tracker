import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import type { SourceDetails } from "@/lib/bbmp-works/types";

/** Renders the per-fact source citations for a BBMP work. Never fabricates a
 *  source — if the record has none, says so plainly. */
export function SourceCitationList({ sources }: { sources: SourceDetails[] }) {
  if (sources.length === 0) {
    return <p className="text-xs text-muted-foreground">No source citations recorded yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {sources.map((s) => {
        const docParts = [
          s.documentName ? `Doc: ${s.documentName}` : null,
          s.referenceNumber ? `Ref: ${s.referenceNumber}` : null,
          s.pageNumber != null ? `p.${s.pageNumber}` : null,
        ].filter((p): p is string => !!p);

        return (
          <li key={s.id} className="border-b border-border/50 pb-3 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-semibold">{s.sourceName}</span>
              {s.isOfficial && (
                <Badge variant="outline" className="text-[10px]">
                  official
                </Badge>
              )}
              {s.sourceUrl && (
                <a
                  href={s.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> View source
                </a>
              )}
            </div>
            {docParts.length > 0 && (
              <p className="mt-0.5 text-xs text-muted-foreground">{docParts.join(" · ")}</p>
            )}
            <p className="mt-0.5 text-[11px] text-muted-foreground/70">
              Accessed {formatDate(s.accessedDate)}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
