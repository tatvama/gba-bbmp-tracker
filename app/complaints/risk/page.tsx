import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getContractorRisk } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_VERIFY_ROLES } from "@/lib/constants";
import { ShieldAlert, Copy, MapPin, ScanEye, Clock } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Risk & Red Flags" };

function Stat({ icon: Icon, label, value, danger }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; danger?: boolean }) {
  return (
    <Card className="px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${danger && value > 0 ? "text-destructive" : "text-muted-foreground"}`} />
        <span className={`text-2xl font-bold tabular-nums ${danger && value > 0 ? "text-destructive" : ""}`}>{value}</span>
      </div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
    </Card>
  );
}

export default async function RiskPage() {
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_VERIFY_ROLES)) {
    return (
      <div>
        <PageHeader title="Risk & Red Flags" />
        <EmptyState title="Not permitted" description="Your role cannot view the risk dashboard. Ask an admin for a Verifier / Complaint Manager / Editor role." />
      </div>
    );
  }

  const { summary, contractors } = await getContractorRisk();

  return (
    <div>
      <PageHeader
        title="Risk & Red Flags"
        description="Fraud signals aggregated across all cases — and contractors ranked by a combined risk score (duplicate photos, off-site GPS, vision flags, overdue follow-ups). Signals are for review, not proof."
        badge={<Badge variant={summary.contractorsAtRisk > 0 ? "destructive" : "success"}>{summary.contractorsAtRisk} contractor(s) at risk</Badge>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Copy} label="Duplicate photos" value={summary.duplicateDocs} danger />
        <Stat icon={MapPin} label="Off-site photos" value={summary.offSitePhotos} danger />
        <Stat icon={ScanEye} label="Vision flags" value={summary.visionFlags} danger />
        <Stat icon={Clock} label="Overdue follow-ups" value={summary.overdueComplaints} danger />
      </div>

      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <ShieldAlert className="h-4 w-4" /> Contractor risk ranking
      </h2>
      {contractors.length === 0 ? (
        <EmptyState title="No contractor signals yet" description="Add a contractor on complaints and run the photo/vision/forensic checks to populate this ranking." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contractor</TableHead>
              <TableHead className="text-right">Risk</TableHead>
              <TableHead className="text-right">Cases</TableHead>
              <TableHead className="text-right">Dup photos</TableHead>
              <TableHead className="text-right">Off-site</TableHead>
              <TableHead className="text-right">Vision</TableHead>
              <TableHead className="text-right">Overdue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contractors.map((c) => (
              <TableRow key={c.contractor}>
                <TableCell className="font-medium">{c.contractor}</TableCell>
                <TableCell className="text-right">
                  <Badge variant={c.score >= 15 ? "destructive" : c.score >= 5 ? "warning" : "muted"}>{c.score}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{c.complaints}</TableCell>
                <TableCell className="text-right tabular-nums">{c.duplicatePhotos || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{c.offSitePhotos || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{c.visionFlags || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{c.overdue || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
