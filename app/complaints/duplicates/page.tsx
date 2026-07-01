import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, ShieldCheck, MapPin, ArrowRight, Users } from "lucide-react";
import {
  runDuplicatePhotoAudit,
  getDivisionResponsibleOfficers,
  type DuplicateCluster,
  type ResponsibleOfficer,
} from "@/lib/dedupe-photos";
import { getSignedUrl } from "@/lib/storage/supabase-upload";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_VERIFY_ROLES } from "@/lib/constants";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Duplicate Photo Audit" };

function sevVariant(s: string): "destructive" | "warning" | "muted" {
  return s === "High" ? "destructive" : s === "Medium" ? "warning" : "muted";
}

export default async function DuplicatePhotosPage() {
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_VERIFY_ROLES)) {
    return (
      <div>
        <PageHeader title="Duplicate Photo Audit" />
        <EmptyState title="Not permitted" description="Your role cannot view the duplicate-photo audit. Ask an admin for a Verifier / Complaint Manager / Editor role." />
      </div>
    );
  }

  const clusters = await runDuplicatePhotoAudit();

  // Resolve thumbnails (signed) + responsible officers per division, once.
  const divIds = Array.from(
    new Set(clusters.flatMap((c) => c.divisions.map((d) => d.divisionId).filter(Boolean) as string[])),
  );
  // Officer lookups and thumbnail signing are independent of each other ->
  // run both groups concurrently instead of one after the other.
  const thumbs = new Map<string, string>();
  const [officerEntries] = await Promise.all([
    Promise.all(divIds.map(async (id) => [id, await getDivisionResponsibleOfficers(id)] as const)),
    Promise.all(
      clusters.flatMap((c) =>
        c.entries.map(async (e) => {
          const url = await getSignedUrl(e.bucket, e.thumbPath ?? e.storagePath, 3600);
          if (url) thumbs.set(e.documentId, url);
        }),
      ),
    ),
  ]);
  const officersByDiv = new Map<string, ResponsibleOfficer[]>(officerEntries);

  const sameDiv = clusters.filter((c) => c.sameDivisionReuse);
  const crossDiv = clusters.filter((c) => !c.sameDivisionReuse);

  return (
    <div>
      <PageHeader
        title="Duplicate Photo Audit"
        description="The same image fingerprint (exact, perceptual, or EXIF GPS/time) appearing on more than one case/job. Same-division reuse — the same photo across different roads/jobs in one division — is shown first. Findings are for verification, not proof."
        badge={
          clusters.length ? (
            <Badge variant="destructive"><ShieldAlert className="h-3 w-3" /> {clusters.length} cluster{clusters.length === 1 ? "" : "s"}</Badge>
          ) : (
            <Badge variant="success"><ShieldCheck className="h-3 w-3" /> None found</Badge>
          )
        }
      />

      {clusters.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No duplicate photos detected" description="No image is currently shared across different cases or job numbers." />
      ) : (
        <div className="space-y-8">
          {sameDiv.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-destructive">
                Same-division reuse ({sameDiv.length}) — primary fraud pattern
              </h2>
              <div className="space-y-4">
                {sameDiv.map((c, i) => <ClusterCard key={`s${i}`} c={c} thumbs={thumbs} officersByDiv={officersByDiv} />)}
              </div>
            </section>
          )}
          {crossDiv.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Cross-division / other reuse ({crossDiv.length})
              </h2>
              <div className="space-y-4">
                {crossDiv.map((c, i) => <ClusterCard key={`c${i}`} c={c} thumbs={thumbs} officersByDiv={officersByDiv} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function ClusterCard({
  c,
  thumbs,
  officersByDiv,
}: {
  c: DuplicateCluster;
  thumbs: Map<string, string>;
  officersByDiv: Map<string, ResponsibleOfficer[]>;
}) {
  return (
    <Card elevated>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Badge variant={sevVariant(c.severity)}>{c.severity}</Badge>
          <span className="text-sm font-medium">
            Same image on {c.entries.length} uploads · {c.matchType === "exact" ? "byte-identical" : "perceptual match"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Thumbnails */}
        <div className="flex flex-wrap gap-2">
          {c.entries.map((e) => {
            const url = thumbs.get(e.documentId);
            return (
              <Link key={e.documentId} href={`/complaints/${e.complaintId}`} className="group relative">
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={e.jobNumber ?? e.caseNumber ?? "photo"} className="h-24 w-24 rounded-md border object-cover" />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-md border bg-muted text-[10px] text-muted-foreground">no preview</div>
                )}
                <span className="absolute inset-x-0 bottom-0 truncate rounded-b-md bg-black/60 px-1 py-0.5 text-[9px] text-white">
                  {e.photoStage && e.photoStage !== "na" ? `${e.photoStage} · ` : ""}{e.jobNumber ?? e.caseNumber ?? "—"}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Per-division breakdown */}
        <div className="space-y-3">
          {c.divisions.map((d, i) => {
            const officers = d.divisionId ? officersByDiv.get(d.divisionId) ?? [] : [];
            return (
              <div key={i} className="rounded-md border bg-muted/30 p-3">
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  {d.division ?? "Unknown division"}
                  {d.corporation && <span className="text-xs font-normal text-muted-foreground">· {d.corporation}</span>}
                  {d.jobs.length > 1 && <Badge variant="destructive" className="ml-1">{d.jobs.length} jobs share this image</Badge>}
                </div>
                <ul className="mt-1.5 space-y-1 text-sm">
                  {d.jobs.map((j, k) => (
                    <li key={k} className="flex flex-wrap items-center gap-2">
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="font-mono text-xs font-semibold">{j.jobNumber ?? "[no job no.]"}</span>
                      {j.road && <span className="text-muted-foreground">· {j.road}</span>}
                      {j.caseNumber && <span className="text-xs text-muted-foreground">({j.caseNumber})</span>}
                    </li>
                  ))}
                </ul>
                {officers.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2 text-xs">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Accountable:</span>
                    {officers.map((o) => (
                      <Link key={o.id} href={`/officers/${o.id}`}>
                        <Badge variant="muted">{o.role_level ?? ""} {o.full_name}</Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
