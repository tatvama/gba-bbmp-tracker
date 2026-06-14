import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { listComplaints } from "@/lib/queries";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Field note" };

/** Pick a complaint to add a field note / communication / photo to (mobile). */
export default async function MobileFieldNotePage() {
  const complaints = (await listComplaints()).slice(0, 30);
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Add a field note" description="Pick a complaint to log a call, note, or upload a site photo.">
        <Button asChild size="sm" variant="outline"><Link href="/complaints/mobile/new"><Plus className="h-4 w-4" /> New</Link></Button>
      </PageHeader>
      {complaints.length === 0 ? (
        <EmptyState title="No complaints" description="Create a complaint first." />
      ) : (
        <ul className="space-y-2">
          {complaints.map((c) => (
            <li key={c.id}>
              <Link href={`/complaints/${c.id}`} className="flex items-center justify-between gap-3 rounded-lg border p-4 hover:border-primary/40">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.internal_case_number ?? ""} · {formatDate(c.updated_at)}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
