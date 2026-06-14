import Link from "next/link";
import { Lock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Importer } from "@/components/import/importer";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getSessionUser, hasRole } from "@/lib/auth";
import { WRITE_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const user = await getSessionUser();
  if (!hasRole(user, WRITE_ROLES)) {
    return (
      <EmptyState icon={Lock} title="Editor access required" description="Sign in as an Editor or Admin to import data.">
        <Button asChild><Link href="/login">Sign in</Link></Button>
      </EmptyState>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Import contacts"
        description="Upload an officer directory (XLSX/CSV). Columns are auto-mapped, every row is validated, and you get a dry-run preview before committing. Duplicates (by phone/email/name) can be skipped or updated."
      />
      <Card className="mb-6 border-amber/30 bg-amber/5">
        <CardContent className="py-3 text-sm text-muted-foreground">
          The authoritative ward/sub-division data is loaded from <code className="rounded bg-muted px-1">data/*.json</code>{" "}
          via <code className="rounded bg-muted px-1">npm run db:seed</code>. This wizard is for importing{" "}
          <strong>contact</strong> spreadsheets. Imported contacts default to Pending / Low confidence.
        </CardContent>
      </Card>
      <Importer />
    </div>
  );
}
