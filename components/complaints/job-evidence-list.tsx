"use client";

import * as React from "react";
import { Eye, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DocumentViewer, type ViewerTarget } from "@/components/complaints/document-viewer";
import { formatDate } from "@/lib/format";
import type { JobEvidenceDoc } from "@/lib/queries";

/**
 * Read-only list of the job case's imported evidence (source WO-*.pdf, forensic
 * JSON, extracted text, the drafted letter) with an inline View for each. These
 * come from job_documents (the audit evidence), shown on the complaint so the
 * operator sees every imported document in one place.
 */
export function JobEvidenceList({ docs }: { docs: JobEvidenceDoc[] }) {
  const [target, setTarget] = React.useState<ViewerTarget | null>(null);
  if (docs.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Imported job evidence ({docs.length})</h3>
        <Badge variant="muted" className="text-[10px]">from the audit ZIP</Badge>
      </div>
      <ul className="space-y-2">
        {docs.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{d.title || d.original_file_name || "Document"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {d.document_type ?? "—"}{d.file_size ? ` · ${(d.file_size / 1024).toFixed(0)} KB` : ""}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTarget({
                documentId: d.id,
                title: d.title || d.original_file_name,
                mimeType: d.mime_type,
                fileName: d.original_file_name,
                source: "job",
              })}
            >
              <Eye className="h-4 w-4" /> View
            </Button>
          </li>
        ))}
      </ul>
      <DocumentViewer target={target} onClose={() => setTarget(null)} />
    </div>
  );
}
