import { notFound } from "next/navigation";
import { FileText, ClipboardList, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getPublicCaseStatus } from "@/lib/queries";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Case status" };

/** Public, no-login status page. Share /track/<uuid> with a citizen. Shows only
 *  sanitised status fields — no internal notes or personal contact data. */
export default async function TrackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const status = await getPublicCaseStatus(id);
  if (!status) notFound();

  const isRti = status.kind === "rti";

  return (
    <div className="mx-auto max-w-xl py-6">
      <Card elevated>
        <CardHeader>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {isRti ? <FileText className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />}
            {isRti ? "RTI application" : "Complaint"}
          </div>
          <CardTitle className="text-xl">{status.title}</CardTitle>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {status.ref && <Badge variant="primary-subtle">{status.ref}</Badge>}
            <Badge variant="muted">{status.status}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {status.ward && (
            <p className="mb-3 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" /> Ward {status.ward}
            </p>
          )}
          <dl className="grid grid-cols-2 gap-3">
            {status.dates.map((d) => (
              <div key={d.label} className="rounded-md border bg-muted/30 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {d.label}
                </dt>
                <dd className="mt-0.5 text-sm font-medium tabular-nums">
                  {d.value && d.value !== "—" ? formatDate(d.value) : "—"}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            This is a public status view. For details, contact the team handling this case.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
