import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { getGbaTree, getBbmpTree } from "@/lib/queries";
import { TreeOrg } from "@/components/explorer/tree-org";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tree Map",
};

export default async function ExplorerPage() {
  const [gbaCorps, bbmpCorps] = await Promise.all([getGbaTree(), getBbmpTree()]);

  return (
    <div>
      <PageHeader
        title="Tree Map"
        description="Interactive hierarchy explorer — switch between GBA (369 wards) and BBMP-225 (225 wards). Click any node to drill down."
      />
      {gbaCorps.length === 0 ? (
        <EmptyState
          title="No GBA data loaded"
          description="Run npm run db:seed-gba to load the 369-ward breakdown, then refresh."
        />
      ) : (
        <TreeOrg gbaCorps={gbaCorps} bbmpCorps={bbmpCorps} />
      )}
    </div>
  );
}
