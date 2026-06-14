import { FileText, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { listSources } from "@/lib/queries";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const sources = await listSources();

  return (
    <div>
      <PageHeader
        title="Source documents"
        description="Provenance for every record. Source PDFs were scanned/image-based, so some mappings and all GBA ward names are incomplete — completeness is treated as a spectrum, not hidden."
      />
      {sources.length === 0 ? (
        <EmptyState icon={FileText} title="No sources recorded" description="The seed registers the BBMP annexure, GBA memo and engineer directory." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {sources.map((s) => (
            <Card key={s.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-medium">{s.title}</h2>
                  {s.document_type && <Badge variant="muted">{s.document_type}</Badge>}
                </div>
                {s.file_name && <p className="mt-1 font-mono text-xs text-muted-foreground">{s.file_name}</p>}
                {s.notes && <p className="mt-2 text-sm text-muted-foreground">{s.notes}</p>}
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  {s.date && <span>{formatDate(s.date)}</span>}
                  {s.url && (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" /> Open
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
