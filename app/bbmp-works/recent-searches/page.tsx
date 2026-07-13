import Link from "next/link";
import { Lock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { RecentSearchesPanel } from "@/components/bbmp-works/recent-searches-panel";
import { listRecentSearches } from "@/lib/bbmp-works/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { VERIFY_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function RecentSearchesPage() {
  const user = await getSessionUser();
  if (!hasRole(user, VERIFY_ROLES)) {
    return (
      <EmptyState
        icon={Lock}
        title="Sign in required"
        description="Recent BBMP work searches are visible to Verifier, Editor and Admin roles."
      >
        <Button asChild><Link href="/login">Sign in</Link></Button>
      </EmptyState>
    );
  }

  const searches = await listRecentSearches(50);

  return (
    <div>
      <PageHeader
        title="Recent BBMP work searches"
        description="The last searches run against the BBMP work registry — query filters, result counts, and when they happened."
      />
      <RecentSearchesPanel searches={searches} />
    </div>
  );
}
