import Link from "next/link";
import { Copy, ImageOff } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { VisualDupScan } from "@/components/forensic/visual-dup-scan";
import { runJobPhotoDuplicateAudit } from "@/lib/forensic/job-photo-dedupe";
import { getSessionUser, hasRole } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/provider";
import { COMPLAINT_VERIFY_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Duplicate photos across job codes" };

export default async function DuplicatePhotosPage() {
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_VERIFY_ROLES)) {
    return (
      <div>
        <PageHeader title="Duplicate photos across job codes" />
        <EmptyState title="Not permitted" description="Your role cannot review duplicate photos." />
      </div>
    );
  }

  const clusters = await runJobPhotoDuplicateAudit();
  const divisions = [...new Set(clusters.flatMap((c) => c.divisions))].sort();

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Duplicate photos across job codes"
        description="The same site photo reused under different job codes (often the same division) is a red flag. Identical / near-identical digital copies are caught instantly by fingerprint; for photos printed on a document and re-scanned, use the visual scan below."
      />

      {!isAiConfigured() && (
        <p className="rounded-lg border border-amber-200/50 bg-amber-50/30 p-3 text-xs text-amber-700 dark:border-slate-800 dark:bg-slate-950/30 dark:text-amber-400">
          AI is not configured — the fingerprint (hash) matches below still work; the visual print→scan scan needs ANTHROPIC_API_KEY.
        </p>
      )}

      <VisualDupScan divisions={divisions} />

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Copy className="h-4 w-4" /> Fingerprint matches ({clusters.length})
        </h2>
        {clusters.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ImageOff className="h-4 w-4" /> No reused photos detected by fingerprint across job codes yet.
          </div>
        ) : (
          <ul className="space-y-3">
            {clusters.map((c) => (
              <li key={c.key} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant={c.basis === "exact" ? "destructive" : "warning"}>
                    {c.basis === "exact" ? "Exact copy" : "Near-identical"}
                  </Badge>
                  {c.sameDivisionReuse && <Badge variant="destructive">same division</Badge>}
                  <span className="text-xs text-muted-foreground">
                    {c.photos.length} photos · {c.jobCodes.length} job codes
                    {c.divisions.length ? ` · ${c.divisions.join(", ")}` : ""}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {c.jobCodes.map((j) => (
                    <Link
                      key={j}
                      href={`/complaints/job/${encodeURIComponent(j)}/dossier`}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900"
                    >
                      {j}
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        A shared photo is a documented suspicion requiring the originals (with intact EXIF/geotag) and an explanation — not conclusive proof of reuse.
      </p>
    </div>
  );
}
