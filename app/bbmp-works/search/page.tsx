import { searchBBMPWork } from "@/lib/bbmp-works/search";
import type { WorkSearchRequest } from "@/lib/bbmp-works/types";
import { WorkSearchForm } from "@/components/bbmp-works/work-search-form";
import { WorkDetailsCard } from "@/components/bbmp-works/work-details-card";
import { WorkResultsList } from "@/components/bbmp-works/work-results-list";
import { WorkNotFound } from "@/components/bbmp-works/work-not-found";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "BBMP Work Search",
};

const FIELDS: (keyof WorkSearchRequest)[] = [
  "jobNumber", "workNumber", "tenderNumber", "workOrderNumber",
  "wardNumber", "wardName", "zone", "division", "subDivision",
  "workName", "location", "layoutName", "roadName",
  "contractorName", "engineerName",
];

export default async function BBMPWorkSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const request: WorkSearchRequest = {};
  for (const field of FIELDS) {
    const value = params[field];
    if (typeof value === "string" && value.trim()) request[field] = value;
  }
  const hasQuery = Object.keys(request).length > 0;
  const result = hasQuery ? await searchBBMPWork(request) : null;
  const singleWork = result && result.success && result.data.length === 1 ? result.data[0] : null;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">BBMP Work Search</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Search BBMP&apos;s official work registry by job number, ward, division, contractor, or engineer.
        </p>
        <WorkSearchForm initial={hasQuery ? request : undefined} />
      </div>

      {!result && (
        <div className="rounded-xl border border-dashed bg-muted/30 py-16 text-center">
          <p className="text-sm font-medium text-foreground/60">
            Enter a job number, ward, division, contractor, or engineer name to search.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            At least one field is required — the more you provide, the narrower the match.
          </p>
        </div>
      )}

      {result && result.success && result.data.length > 1 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{result.totalResults}</span> result
            {result.totalResults === 1 ? "" : "s"} found
          </p>
          <WorkResultsList works={result.data} />
        </div>
      )}

      {singleWork && <WorkDetailsCard work={singleWork} />}

      {result && !result.success && result.errorCode === "NO_DATA" && (
        <WorkNotFound suggestions={result.suggestions} />
      )}

      {result && !result.success && result.errorCode !== "NO_DATA" && (
        <div className="rounded-xl border border-dashed border-destructive/30 bg-destructive/5 py-16 text-center">
          <p className="text-sm font-medium text-destructive">{result.message}</p>
        </div>
      )}
    </div>
  );
}
