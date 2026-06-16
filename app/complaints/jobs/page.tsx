import Link from "next/link";
import { ShieldAlert, ScrollText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listJobNumbers, getJobAudit } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_VERIFY_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Job-Number Forensic Audits" };

function band(b: string | null): { variant: "destructive" | "warning" | "muted" | "success"; label: string } {
  switch (b) {
    case "bill_stop": return { variant: "destructive", label: "Bill-stop" };
    case "serious": return { variant: "destructive", label: "Serious" };
    case "procedural": return { variant: "warning", label: "Procedural" };
    case "low": return { variant: "muted", label: "Low" };
    default: return { variant: "muted", label: "Not audited" };
  }
}

export default async function JobsPage() {
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_VERIFY_ROLES)) {
    return (
      <div>
        <PageHeader title="Job-Number Forensic Audits" />
        <EmptyState title="Not permitted" description="Your role cannot view forensic audits." />
      </div>
    );
  }

  const jobs = await listJobNumbers();
  const audits = await Promise.all(jobs.map((j) => getJobAudit(j.jobNumber)));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Job-Number Forensic Audits"
        description="Each government job number aggregates all linked complaints and their documents into one forensic audit. Run the audit, then draft a Kannada bill-stop / Lokayukta / RTI letter from the findings."
      />
      {jobs.length === 0 ? (
        <EmptyState title="No job numbers yet" description="Set a job number on complaints (in the complaint form) to group their documents for a job-level audit." />
      ) : (
        <div className="space-y-2">
          {jobs.map((j, i) => {
            const a = audits[i];
            const b = band(a?.riskBand ?? null);
            return (
              <Card key={j.jobNumber}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-mono text-sm font-semibold">{j.jobNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {j.complaints} complaint{j.complaints === 1 ? "" : "s"}
                      {a ? ` · ${a.findingCount} findings · ${a.redFlagCount} red flags` : " · not yet audited"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={b.variant}>{b.label}{a ? ` · ${a.riskScore}` : ""}</Badge>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/complaints/job/${encodeURIComponent(j.jobNumber)}/audit`}><ShieldAlert className="h-4 w-4" /> Audit</Link>
                    </Button>
                    {a && (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/complaints/job/${encodeURIComponent(j.jobNumber)}/letter`}><ScrollText className="h-4 w-4" /> Letter</Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
