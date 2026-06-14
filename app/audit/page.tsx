import Link from "next/link";
import { Lock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { listAuditLogs } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { VERIFY_ROLES } from "@/lib/constants";
import { formatDateTime, orDash } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  const { entity } = await searchParams;
  const user = await getSessionUser();
  if (!hasRole(user, VERIFY_ROLES)) {
    return (
      <EmptyState icon={Lock} title="Sign in required" description="Audit logs are visible to Verifier, Editor and Admin roles.">
        <Button asChild><Link href="/login">Sign in</Link></Button>
      </EmptyState>
    );
  }

  const logs = await listAuditLogs(entity ? { entityType: entity } : undefined, 300);

  return (
    <div>
      <PageHeader
        title="Audit logs"
        description="Every mutation to a contact or ward is recorded here — field, old value, new value, who and when."
      />
      <div className="mb-3 flex gap-2">
        {["", "contact", "ward", "complaint"].map((e) => (
          <Button key={e || "all"} asChild size="sm" variant={(entity ?? "") === e ? "default" : "outline"}>
            <Link href={e ? `/audit?entity=${e}` : "/audit"}>{e || "All"}</Link>
          </Button>
        ))}
      </div>
      {logs.length === 0 ? (
        <EmptyState title="No audit entries yet" description="Edits will appear here once the app has data and edits are made." />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Field</TableHead>
                <TableHead>Old → New</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(a.changed_at)}</TableCell>
                  <TableCell><Badge variant="muted">{a.entity_type}</Badge></TableCell>
                  <TableCell className="font-medium">{a.field_name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{orDash(a.old_value)} → {orDash(a.new_value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
