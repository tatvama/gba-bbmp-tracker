import Link from "next/link";
import { Building2, FileText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PortalDownload } from "@/components/ifms/portal-download";
import { JobCaseActions } from "@/components/ifms/job-case-actions";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/provider";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "BBMP Portal Import" };

function bandBadge(b: string | null): { variant: "destructive" | "warning" | "muted" | "success"; label: string } {
  switch (b) {
    case "bill_stop": return { variant: "destructive", label: "Bill-stop" };
    case "serious": return { variant: "destructive", label: "Serious" };
    case "procedural": return { variant: "warning", label: "Procedural" };
    case "low": return { variant: "success", label: "Low" };
    default: return { variant: "muted", label: "Not audited" };
  }
}

export default async function PortalImportPage() {
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_FIELD_ROLES)) {
    return (
      <div>
        <PageHeader title="BBMP Portal Import" />
        <EmptyState title="Not permitted" description="Your role cannot download or import portal documents." />
      </div>
    );
  }

  const supabase = await createClient();
  const { data: casesRaw } = await supabase
    .from("job_cases")
    .select("id, job_number, description, file_count, status, complaint_id, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const cases = casesRaw ?? [];
  const ids = cases.map((c) => c.id as string);
  const jobNumbers = cases.map((c) => c.job_number as string);

  // OCR progress per case (queued/processing vs total) — one query, aggregated in JS.
  const queuedByCase = new Map<string, number>();
  if (ids.length) {
    const { data: docs } = await supabase.from("job_documents").select("job_case_id, ocr_status").in("job_case_id", ids);
    for (const d of docs ?? []) {
      if (d.ocr_status === "Queued" || d.ocr_status === "Processing") {
        queuedByCase.set(d.job_case_id as string, (queuedByCase.get(d.job_case_id as string) ?? 0) + 1);
      }
    }
  }

  // Latest audit per job number → risk band.
  const bandByJob = new Map<string, { band: string | null; score: number; findings: number }>();
  if (jobNumbers.length) {
    const { data: audits } = await supabase
      .from("job_audits")
      .select("job_number, risk_band, risk_score, finding_count, created_at")
      .in("job_number", jobNumbers)
      .order("created_at", { ascending: false });
    for (const a of audits ?? []) {
      const jn = a.job_number as string;
      if (!bandByJob.has(jn)) bandByJob.set(jn, { band: a.risk_band as string | null, score: a.risk_score as number, findings: a.finding_count as number });
    }
  }

  const aiConfigured = isAiConfigured();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="BBMP Portal Import"
        description="Download a job code's work-order, bill, MB, agreement and photo documents straight from the public BBMP IFMS portal. Each job becomes a job case you can OCR, run the forensic audit on, and convert into a complaint."
      />

      <PortalDownload />

      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Job cases ({cases.length})</h2>
        {cases.length === 0 ? (
          <EmptyState
            title="No job cases yet"
            description="Use the box above to download a job code (e.g. 044-22-000011) or a whole ward+year (e.g. 044-22) from the portal."
          />
        ) : (
          <div className="space-y-2">
            {cases.map((c) => {
              const queued = queuedByCase.get(c.id as string) ?? 0;
              const audit = bandByJob.get(c.job_number as string);
              const b = bandBadge(audit?.band ?? null);
              return (
                <Card key={c.id as string}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-mono text-sm font-semibold">
                        <Building2 className="h-4 w-4 text-muted-foreground" /> {c.job_number as string}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {(c.description as string) || "—"}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <FileText className="h-3 w-3" /> {(c.file_count as number) ?? 0} files
                        {queued > 0 ? ` · ${queued} awaiting OCR` : " · OCR done"}
                        {audit ? ` · ${audit.findings} findings` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={b.variant}>{b.label}{audit ? ` · ${audit.score}` : ""}</Badge>
                      <JobCaseActions
                        jobNumber={c.job_number as string}
                        jobCaseId={c.id as string}
                        queuedCount={queued}
                        aiConfigured={aiConfigured}
                        complaintId={(c.complaint_id as string | null) ?? null}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
